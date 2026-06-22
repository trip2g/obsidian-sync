/**
 * Long-running foreground daemon for two-way sync between a local vault and a
 * trip2g instance, without Obsidian.
 *
 *   remote -> local : LivePullConnection (noteChanges SSE subscription)
 *   local  -> remote: filesystem watcher (chokidar, else fs.watch) + auto-push
 *
 * See docs spec: "trip2g-sync watch mode + live-follow URL flag design".
 *
 * This module only exports `runWatch` and helpers. Wiring into `main()`
 * (CLI arg parsing) is done separately (US-005).
 */

import * as fs from "fs";
import * as path from "path";
import { NodeEnv, type CliConflictResolution } from "./env";
import { classifySync } from "../classify";
import { filterPlan } from "../filter";
import { executePlan } from "../execute";
import { makeExcludeMatcher } from "../exclude";
import { applyLiveChanges, type LiveApplyEnv } from "../live-apply";
import {
	LivePullConnection,
	type LivePullConnectionOptions,
	type NoteChangeItem,
} from "../LivePullConnection";
import type { SyncEnv } from "../types";

/** Debounce window for batching FS events before a push (ms). */
const FS_DEBOUNCE_MS = 500;
/** Periodic reconcile sweep interval when running on the fs.watch fallback (ms). */
const FALLBACK_SWEEP_MS = 20000;

// ============ Injectable seams (for tests) ============

/** Subset of LivePullConnection used by watch — lets tests inject a fake. */
export interface LivePullLike {
	connect(): void;
	disconnect(): void;
}

/** Subset of a chokidar/fs.watch watcher used by watch. */
export interface WatcherLike {
	/** Register a path-change listener. Called for any add/change/unlink. */
	onChange(listener: (filePath: string) => void): void;
	/** Stop watching and release resources. */
	close(): Promise<void> | void;
}

/** Timer primitives — injectable so tests can drive a fake clock. */
export interface ClockLike {
	setInterval(handler: () => void, ms: number): ReturnType<typeof setInterval>;
	clearInterval(handle: ReturnType<typeof setInterval>): void;
	setTimeout(handler: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const realClock: ClockLike = {
	setInterval: (h, ms) => setInterval(h, ms),
	clearInterval: (h) => clearInterval(h),
	setTimeout: (h, ms) => setTimeout(h, ms),
	clearTimeout: (h) => clearTimeout(h),
};

/** Registers a termination handler. Default wraps process.once for SIGINT/SIGTERM. */
export type SignalRegistrar = (handler: (signal: string) => void) => void;

const realSignals: SignalRegistrar = (handler) => {
	process.once("SIGINT", () => handler("SIGINT"));
	process.once("SIGTERM", () => handler("SIGTERM"));
};

export interface WatchDeps {
	/** Build the SSE follower. Default: real LivePullConnection. */
	livePullFactory?: (opts: LivePullConnectionOptions) => LivePullLike;
	/**
	 * Build the FS watcher for `folder`. Default: chokidar if importable, else
	 * fs.watch (with a periodic reconcile sweep). When a factory is injected the
	 * fallback sweep is NOT started (the test drives events directly).
	 */
	watcherFactory?: (folder: string) => WatcherLike;
	/** Timer primitives — default: real timers. */
	clock?: ClockLike;
	/** Wall clock — default: Date.now. */
	now?: () => number;
	/** Register termination handler(s). Default: process.once SIGINT/SIGTERM. */
	signals?: SignalRegistrar;
	/**
	 * Build the sync env. Default: real NodeEnv (talks to the trip2g instance).
	 * Tests inject a fake to control classify/push/server behavior. The env must
	 * implement both SyncEnv and LiveApplyEnv (NodeEnv does).
	 */
	envFactory?: (args: WatchArgs) => WatchEnv;
	/**
	 * Import the chokidar module. Default: dynamic `import("chokidar")`. Tests
	 * inject a rejecting impl to force the fs.watch fallback path.
	 */
	importChokidar?: () => Promise<unknown>;
}

/** The env watch needs: the full sync engine env plus the live-apply primitives. */
export type WatchEnv = SyncEnv & LiveApplyEnv;

/** Arguments for runWatch — a subset of the CLI args relevant to watch mode. */
export interface WatchArgs {
	folder: string;
	/** Full GraphQL endpoint (already includes /_system/graphql). */
	apiUrl: string;
	apiKey: string;
	include: string[];
	exclude: string[];
	conflictResolution: CliConflictResolution;
	meta?: Record<string, string>;
	verbose?: boolean;
	/** livePullIncludePatterns from data.json (fallback when no --include). */
	dataInclude?: string[];
	/** livePullExcludePatterns from data.json (fallback when no --exclude). */
	dataExclude?: string[];
}

/** Result of a watch run — resolves only after the daemon drains and exits. */
export interface WatchResult {
	exitCode: number;
}

// ============ Helpers ============

/** Line-oriented stdout log matching the existing CLI style. */
function log(message: string): void {
	console.log(message);
}

/** Read the plugin version from manifest.json next to the bundle, else "cli". */
export function readPluginVersion(): string {
	const candidates = [
		path.join(process.cwd(), "manifest.json"),
		path.join(__dirname, "..", "..", "..", "manifest.json"),
	];
	for (const file of candidates) {
		try {
			const data = JSON.parse(fs.readFileSync(file, "utf-8"));
			if (typeof data?.version === "string" && data.version) {
				return data.version;
			}
		} catch {
			// try next
		}
	}
	return "cli";
}

/**
 * Should this FS path be considered for sync?
 * Excludes the local state dir, dotfiles/dotdirs, and node_modules — matching
 * NodeEnv.getLocalFiles() so we never push transient/internal files.
 */
export function isWatchablePath(relPath: string): boolean {
	const norm = relPath.split(path.sep).join("/");
	if (norm.startsWith(".trip2g-memory/") || norm === ".trip2g-memory") {
		return false;
	}
	for (const segment of norm.split("/")) {
		if (segment === "node_modules") return false;
		if (segment.startsWith(".")) return false;
	}
	return true;
}

/**
 * Promise-chain mutex: each critical section chains onto a single tail promise.
 * Guarantees serialization (one critical section runs at a time) with no deps.
 */
export function createLock(): { run<T>(fn: () => Promise<T>): Promise<T>; idle(): Promise<void> } {
	let tail: Promise<unknown> = Promise.resolve();
	return {
		run<T>(fn: () => Promise<T>): Promise<T> {
			const result = tail.then(() => fn());
			// Keep the chain alive even if a section rejects; swallow here so the
			// next section still runs. Callers get the real result/rejection.
			tail = result.then(
				() => undefined,
				() => undefined
			);
			return result;
		},
		/** Resolves when the current chain is drained. */
		idle(): Promise<void> {
			return tail.then(() => undefined);
		},
	};
}

// ============ Main entry ============

/**
 * Start the watch daemon. Resolves with an exit code once the process drains
 * (on SIGINT/SIGTERM) or hits a fatal error.
 */
export async function runWatch(args: WatchArgs, deps: WatchDeps = {}): Promise<WatchResult> {
	const clock = deps.clock ?? realClock;
	const now = deps.now ?? Date.now;

	const env: WatchEnv =
		deps.envFactory?.(args) ??
		new NodeEnv({
			folder: args.folder,
			apiUrl: args.apiUrl,
			apiKey: args.apiKey,
			twoWaySync: true,
			verbose: args.verbose,
			conflictResolution: args.conflictResolution,
			meta: args.meta,
		});

	const isExcluded = makeExcludeMatcher(args.exclude);
	const lock = createLock();

	let draining = false;
	let reconcileDone = false;
	let settled = false;
	/** SSE batches that arrive before reconcile finishes are queued here. */
	const pendingSse: NoteChangeItem[][] = [];

	// Refs filled in as the daemon comes up; drain() reads them defensively so a
	// signal during startup (e.g. mid-reconcile) is handled cleanly.
	let livePullRef: LivePullLike | null = null;
	let watcherRef: WatcherLike | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let sweepTimer: ReturnType<typeof setInterval> | null = null;
	let resolveRun: ((r: WatchResult) => void) | null = null;

	log(`👀 watch: starting for ${args.folder}`);

	const drain = async (signal: string): Promise<void> => {
		if (settled) {
			return;
		}
		draining = true;
		log(`🛑 watch: ${signal} received, draining…`);

		// Stop accepting new work.
		if (debounceTimer !== null) {
			clock.clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (sweepTimer !== null) {
			clock.clearInterval(sweepTimer);
			sweepTimer = null;
		}
		if (livePullRef) {
			livePullRef.disconnect();
		}
		if (watcherRef) {
			try {
				await watcherRef.close();
			} catch {
				// best-effort
			}
		}

		// Wait for any in-flight critical section (push / applyLiveChanges).
		await lock.idle();

		// Persist final state.
		await env.saveSyncState(env.getSyncState());

		settled = true;
		log("✅ watch: drained, exiting");
		if (resolveRun) {
			resolveRun({ exitCode: 0 });
		}
	};

	// Register signal handlers early so a SIGINT during reconcile is honored.
	const registerSignals = deps.signals ?? realSignals;
	registerSignals((signal) => void drain(signal));

	// ---- 2. SSE follower (remote -> local) ----
	// The connection is constructed up front so the `onChanges` handler exists
	// before reconcile runs (handler gates itself behind `reconcileDone`), but
	// `connect()` is deferred until reconcile completes.
	const applyEnv: LiveApplyEnv = env;

	const handleChanges = (changes: NoteChangeItem[]): void => {
		if (!reconcileDone) {
			// Gate: queue until reconcile completes.
			pendingSse.push(changes);
			return;
		}
		if (draining) {
			return;
		}
		void lock.run(async () => {
			const syncState = env.getSyncState();
			const result = await applyLiveChanges(applyEnv, changes, syncState);
			// Delete any hide-eligible paths the server asked us to drop.
			for (const hidePath of result.hiddenPaths) {
				await env.deleteFile(hidePath);
				delete syncState.files[hidePath];
			}
			if (result.pulledPaths.length > 0) {
				log(`📥 watch: pulled ${result.pulledPaths.length} note(s) from server`);
			}
			if (result.hiddenPaths.length > 0) {
				log(`🗑️  watch: removed ${result.hiddenPaths.length} hidden note(s)`);
			}
			await env.saveSyncState(syncState);
		});
	};

	const patterns = resolveWatchPatterns(args);
	const pluginVersion = readPluginVersion();
	const livePullFactory =
		deps.livePullFactory ?? ((opts) => new LivePullConnection(opts));
	const livePull = livePullFactory({
		apiUrl: args.apiUrl,
		apiKey: args.apiKey,
		pluginVersion,
		endpoint: args.apiUrl,
		includePatterns: patterns.include,
		excludePatterns: patterns.exclude,
		onConnected: () => log("🔌 watch: live-pull connected"),
		onChanges: handleChanges,
	});
	livePullRef = livePull;

	// ---- 1. Startup reconcile (gates the SSE follower) ----
	await lock.run(async () => {
		log("📊 watch: reconciling…");
		await runOneShot(env, isExcluded);
		reconcileDone = true;
		log("✅ watch: reconcile complete");
	});

	// If a signal arrived during reconcile, the drain handler already cleaned up
	// and resolved (or will once the lock drains). Exit without starting more.
	if (draining) {
		return { exitCode: 0 };
	}

	livePull.connect();

	// Drain any SSE batches that queued during reconcile.
	if (pendingSse.length > 0) {
		const queued = pendingSse.splice(0, pendingSse.length);
		for (const batch of queued) {
			handleChanges(batch);
		}
	}

	// ---- 3. FS watcher (local -> remote) ----
	const dirtyPaths = new Set<string>();

	const flushBatch = (): void => {
		debounceTimer = null;
		if (draining) {
			return;
		}
		if (dirtyPaths.size === 0) {
			return;
		}
		const batch = Array.from(dirtyPaths);
		dirtyPaths.clear();
		void lock.run(async () => {
			log(`📤 watch: pushing ${batch.length} local change(s)`);
			await runOneShot(env, isExcluded);
		});
	};

	const onFsChange = (filePath: string): void => {
		if (draining) {
			return;
		}
		const rel = path.isAbsolute(filePath)
			? path.relative(path.resolve(args.folder), filePath)
			: filePath;
		if (!isWatchablePath(rel)) {
			return;
		}
		dirtyPaths.add(rel);
		if (debounceTimer !== null) {
			clock.clearTimeout(debounceTimer);
		}
		debounceTimer = clock.setTimeout(flushBatch, FS_DEBOUNCE_MS);
	};

	const { watcher, usingFallback } = await createWatcher(args.folder, deps);
	watcherRef = watcher;
	watcher.onChange(onFsChange);

	// Fallback sweep: with fs.watch we may miss events, so reconcile periodically.
	// Skipped when a watcherFactory is injected by tests UNLESS we are on the
	// real fallback path.
	if (usingFallback) {
		log("⚠️  watch: chokidar unavailable, using fs.watch + periodic sweep (best-effort)");
		sweepTimer = clock.setInterval(() => {
			if (draining) {
				return;
			}
			void lock.run(async () => {
				await runOneShot(env, isExcluded);
			});
		}, FALLBACK_SWEEP_MS);
	}

	// `now` is reserved for future health logging; reference it so the injected
	// dep is not flagged as unused.
	void now;

	// ---- 4. Run until a termination signal drains the daemon ----
	// If a signal already arrived after reconcile but before we got here, drain
	// has set `settled`; resolve immediately.
	if (settled) {
		return { exitCode: 0 };
	}
	return await new Promise<WatchResult>((resolve) => {
		resolveRun = resolve;
	});
}

// ============ Internal helpers ============

/** Resolve effective SSE include/exclude patterns (flags > data.json > default). */
function resolveWatchPatterns(args: WatchArgs): { include: string[]; exclude: string[] } {
	const include =
		args.include.length > 0
			? args.include
			: args.dataInclude && args.dataInclude.length > 0
				? args.dataInclude
				: ["**"];
	const exclude =
		args.exclude.length > 0
			? args.exclude
			: args.dataExclude && args.dataExclude.length > 0
				? args.dataExclude
				: [];
	return { include, exclude };
}

/** Run one two-way one-shot sync (classify -> filter -> execute). */
async function runOneShot(env: SyncEnv, isExcluded: (p: string) => boolean): Promise<void> {
	const plan = await classifySync(env);
	const filtered = filterPlan(plan, { twoWaySync: true, isExcluded });
	await executePlan(env, filtered, { twoWaySync: true });
}

/**
 * Build the FS watcher. Prefers an injected factory; otherwise tries chokidar
 * and falls back to fs.watch (signalling `usingFallback` so the caller starts a
 * periodic reconcile sweep).
 */
async function createWatcher(
	folder: string,
	deps: WatchDeps
): Promise<{ watcher: WatcherLike; usingFallback: boolean }> {
	if (deps.watcherFactory) {
		return { watcher: deps.watcherFactory(folder), usingFallback: false };
	}

	// Try chokidar first.
	try {
		const importChokidar = deps.importChokidar ?? (() => import("chokidar"));
		const chokidarMod: any = await importChokidar();
		const chokidar = chokidarMod.default ?? chokidarMod;
		if (typeof chokidar?.watch !== "function") {
			throw new Error("chokidar.watch unavailable");
		}
		const fsw = chokidar.watch(folder, {
			ignoreInitial: true,
			ignored: /(^|[/\\])\../, // dotfiles
		});
		const watcher: WatcherLike = {
			onChange(listener) {
				fsw.on("add", listener);
				fsw.on("change", listener);
				fsw.on("unlink", listener);
			},
			close() {
				return fsw.close();
			},
		};
		return { watcher, usingFallback: false };
	} catch {
		// Fall back to fs.watch (recursive). Node >=20 on Linux/macOS/Windows.
		const resolved = path.resolve(folder);
		const listeners: Array<(filePath: string) => void> = [];
		const fsWatcher = fs.watch(resolved, { recursive: true }, (_event, filename) => {
			if (!filename) return;
			const rel = typeof filename === "string" ? filename : filename.toString();
			for (const l of listeners) {
				l(rel);
			}
		});
		const watcher: WatcherLike = {
			onChange(listener) {
				listeners.push(listener);
			},
			close() {
				fsWatcher.close();
			},
		};
		return { watcher, usingFallback: true };
	}
}
