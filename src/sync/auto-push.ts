/**
 * Auto-push scheduler for "Auto-sync on save".
 *
 * Coalesces local file modifications into a single debounced push, mirroring the
 * CLI watcher's single-timer model (src/sync/cli/watch.ts): one trailing timer +
 * a dirty Set, reset on each modify so a burst of keystrokes collapses into one
 * flush. The timer primitives are injectable (like watch.ts's ClockLike) so the
 * debounce is unit-testable with a fake clock — Obsidian's `debounce` helper has
 * no runtime outside Obsidian, so it cannot be exercised in vitest.
 *
 * This module is Obsidian-free on purpose: the plugin (main.ts) supplies the
 * real timers, the enabled/busy predicates, and the `flush` that runs the shared
 * classify -> filter -> execute push pipeline.
 */

/** Timer primitives — injectable so tests can drive a fake clock. */
export interface AutoPushClock {
	setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const realClock: AutoPushClock = {
	setTimeout: (h, ms) => setTimeout(h, ms),
	clearTimeout: (h) => clearTimeout(h),
};

export interface AutoPushSchedulerDeps {
	/** Trailing debounce window (ms). */
	debounceMs: number;
	/** Whether auto-sync is currently enabled (checked lazily so the toggle takes effect live). */
	isEnabled: () => boolean;
	/** Whether a sync (manual / live-pull) is currently running. When true, the flush re-arms instead of running. */
	isBusy: () => boolean;
	/** Push the coalesced dirty paths. Resolves when the push completes. */
	flush: (paths: string[]) => Promise<void>;
	/** Timer primitives. Default: real timers. */
	clock?: AutoPushClock;
	/**
	 * How long a self-write suppression entry lives before auto-expiring (ms).
	 * Safety net so a suppressed path that never produces a matching "modify"
	 * (e.g. a create, or identical content) can't swallow a later real edit.
	 * Default: debounceMs.
	 */
	suppressTtlMs?: number;
}

export class AutoPushScheduler {
	private readonly dirty = new Set<string>();
	private readonly suppressed = new Set<string>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly clock: AutoPushClock;
	private readonly suppressTtlMs: number;

	constructor(private readonly deps: AutoPushSchedulerDeps) {
		this.clock = deps.clock ?? realClock;
		this.suppressTtlMs = deps.suppressTtlMs ?? deps.debounceMs;
	}

	/**
	 * Record paths the plugin itself just wrote (live-pull / applyLiveChanges) so
	 * the resulting vault "modify" event does NOT schedule an echo push. One-shot:
	 * each path is consumed by the next schedule() for it, and auto-expires after
	 * suppressTtlMs so it can never swallow a later genuine edit.
	 */
	suppress(paths: Iterable<string>): void {
		for (const path of paths) {
			this.suppressed.add(path);
			this.clock.setTimeout(() => this.suppressed.delete(path), this.suppressTtlMs);
		}
	}

	/** Queue a dirty path and (re)arm the trailing debounce. No-op when disabled. */
	schedule(path: string): void {
		if (!this.deps.isEnabled()) return;
		// Self-write echo: consume the one-shot suppression and skip scheduling.
		if (this.suppressed.delete(path)) return;
		this.dirty.add(path);
		this.arm();
	}

	/** Cancel the pending timer (teardown / disable). Does not clear dirty paths. */
	cancel(): void {
		if (this.timer !== null) {
			this.clock.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private arm(): void {
		if (this.timer !== null) {
			this.clock.clearTimeout(this.timer);
		}
		this.timer = this.clock.setTimeout(() => this.fire(), this.deps.debounceMs);
	}

	private fire(): void {
		this.timer = null;
		if (this.dirty.size === 0) return;
		// Busy (manual sync / live-pull in flight): keep the batch, retry after the
		// window so we never run concurrently with a manual sync or live-pull.
		if (this.deps.isBusy()) {
			this.arm();
			return;
		}
		const paths = Array.from(this.dirty);
		this.dirty.clear();
		void this.deps.flush(paths);
	}
}
