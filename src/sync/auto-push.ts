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
	/**
	 * Push the coalesced dirty paths. Resolves when the push completes.
	 * May return the subset of paths it actually confirmed pushed; any queued
	 * path NOT returned stays dirty and is retried on the next window (so a save
	 * whose disk-write lands late is never dropped). Returning void/undefined
	 * means "all given paths confirmed".
	 */
	flush: (paths: string[]) => Promise<string[] | void>;
	/** Timer primitives. Default: real timers. */
	clock?: AutoPushClock;
	/**
	 * How long a self-write suppression entry lives before auto-expiring (ms).
	 * Safety net so a suppressed path that never produces a matching "modify"
	 * (e.g. a create, or identical content) can't swallow a later real edit.
	 * Default: debounceMs.
	 */
	suppressTtlMs?: number;
	/**
	 * Max consecutive unconfirmed flushes for a single path before giving up on it,
	 * so a persistently-failing push (server keeps rejecting one file) can't spin
	 * the pipeline forever. A fresh schedule() of the path resets its budget.
	 * Default: 5.
	 */
	maxAttempts?: number;
}

export class AutoPushScheduler {
	private readonly dirty = new Set<string>();
	private readonly suppressed = new Set<string>();
	// Consecutive unconfirmed flushes per still-dirty path (retry budget).
	private readonly attempts = new Map<string, number>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight = false;
	private readonly clock: AutoPushClock;
	private readonly suppressTtlMs: number;
	private readonly maxAttempts: number;

	constructor(private readonly deps: AutoPushSchedulerDeps) {
		this.clock = deps.clock ?? realClock;
		this.suppressTtlMs = deps.suppressTtlMs ?? deps.debounceMs;
		this.maxAttempts = deps.maxAttempts ?? 5;
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
		this.attempts.delete(path); // a fresh edit resets the retry budget
		this.arm();
	}

	/** Number of distinct paths queued for the next flush. */
	pendingCount(): number {
		return this.dirty.size;
	}

	/** Cancel the pending timer (teardown / disable). Does not clear dirty paths. */
	cancel(): void {
		if (this.timer !== null) {
			this.clock.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Count an unconfirmed flush for a path; once it exceeds maxAttempts, give up
	 * (drop it from the queue) so a persistently-failing push stops re-arming.
	 */
	private recordUnconfirmed(path: string): void {
		if (!this.dirty.has(path)) return; // a fresh edit may have re-queued/reset it
		const n = (this.attempts.get(path) ?? 0) + 1;
		if (n >= this.maxAttempts) {
			this.dirty.delete(path);
			this.attempts.delete(path);
		} else {
			this.attempts.set(path, n);
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
		// Busy (manual sync / live-pull in flight), or our own flush still running:
		// keep the batch and retry after the window so we never run concurrently
		// and never drop the queue.
		if (this.inFlight || this.deps.isBusy()) {
			this.arm();
			return;
		}
		// Snapshot the batch but do NOT clear `dirty` yet: the flush is async and
		// may confirm only a subset (e.g. a file whose disk-write lands after the
		// push read it). Only confirmed paths are removed; anything left — including
		// saves that arrive during the flush — stays queued and re-arms below.
		const paths = Array.from(this.dirty);
		this.inFlight = true;
		void this.deps
			.flush(paths)
			.then((confirmed) => {
				const done = new Set(confirmed ?? paths); // void => all confirmed
				for (const p of paths) {
					if (done.has(p)) {
						this.dirty.delete(p);
						this.attempts.delete(p);
					} else {
						this.recordUnconfirmed(p); // may give up after maxAttempts
					}
				}
			})
			.catch(() => {
				// Flush threw: keep the batch dirty, but still count the attempt so a
				// persistently-throwing push gives up instead of spinning forever.
				for (const p of paths) this.recordUnconfirmed(p);
			})
			.finally(() => {
				this.inFlight = false;
				if (this.dirty.size > 0) this.arm();
			});
	}
}
