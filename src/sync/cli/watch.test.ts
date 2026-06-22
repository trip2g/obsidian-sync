import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runWatch, createLock, isWatchablePath, type WatchEnv, type WatchArgs, type WatchDeps } from "./watch";
import type {
	SyncState,
	LocalFile,
	ServerHash,
	NoteUpdate,
	PushedNote,
	NoteContent,
	Progress,
} from "../types";
import type { NoteChangeItem } from "../LivePullConnection";

// ============ Fake clock ============

interface ScheduledTimer {
	id: number;
	due: number;
	handler: () => void;
	interval: number | null; // null = one-shot
}

class FakeClock {
	private nowMs = 0;
	private nextId = 1;
	private timers = new Map<number, ScheduledTimer>();

	now = (): number => this.nowMs;

	setTimeout = (handler: () => void, ms: number): number => {
		const id = this.nextId++;
		this.timers.set(id, { id, due: this.nowMs + ms, handler, interval: null });
		return id;
	};
	clearTimeout = (id: number): void => {
		this.timers.delete(id);
	};
	setInterval = (handler: () => void, ms: number): number => {
		const id = this.nextId++;
		this.timers.set(id, { id, due: this.nowMs + ms, handler, interval: ms });
		return id;
	};
	clearInterval = (id: number): void => {
		this.timers.delete(id);
	};

	/** Advance virtual time, firing due timers in order. */
	async advance(ms: number): Promise<void> {
		const target = this.nowMs + ms;
		// Loop firing the earliest-due timer until we pass target.
		// Re-evaluate each step so intervals reschedule correctly.
		for (;;) {
			let next: ScheduledTimer | undefined;
			for (const t of this.timers.values()) {
				if (t.due <= target && (next === undefined || t.due < next.due)) {
					next = t;
				}
			}
			if (!next) break;
			this.nowMs = next.due;
			if (next.interval !== null) {
				next.due = this.nowMs + next.interval;
			} else {
				this.timers.delete(next.id);
			}
			next.handler();
			// Let any microtasks queued by the handler settle.
			await flushMicrotasks();
		}
		this.nowMs = target;
	}
}

async function flushMicrotasks(): Promise<void> {
	// Many rounds to drain promise-chain mutex continuations (classify -> filter
	// -> execute each add several await hops).
	for (let i = 0; i < 60; i++) {
		await Promise.resolve();
	}
}

const clockClock = (c: FakeClock) => ({
	setTimeout: c.setTimeout,
	clearTimeout: c.clearTimeout,
	setInterval: c.setInterval,
	clearInterval: c.clearInterval,
});

// ============ Fake env (in-memory vault + server) ============

function hash(content: string): string {
	return `h:${content}`;
}

interface FakeEnvModel {
	local: Map<string, string>; // path -> content (local vault)
	server: Map<string, string>; // path -> content (remote)
	pushes: NoteUpdate[][]; // recorded push batches
}

function makeFakeEnv(model: FakeEnvModel, syncState: SyncState): WatchEnv {
	const env: WatchEnv = {
		pushBatchSize: 100,

		// ClassifyEnv
		async getLocalFiles(): Promise<LocalFile[]> {
			return Array.from(model.local.keys()).map((path, i) => ({ path, mtime: i + 1 }));
		},
		async getServerHashes(): Promise<ServerHash[]> {
			return Array.from(model.server.entries()).map(([path, content]) => ({
				path,
				hash: hash(content),
			}));
		},
		getSyncState(): SyncState {
			return syncState;
		},
		async computeHash(content: string): Promise<string> {
			return hash(content);
		},
		async readFileContent(path: string): Promise<string> {
			const c = model.local.get(path);
			if (c === undefined) throw new Error(`no local file: ${path}`);
			return c;
		},

		// File ops
		async writeFile(path: string, content: string): Promise<void> {
			model.local.set(path, content);
		},
		async writeBinaryFile(): Promise<void> {},
		async readBinaryFile(): Promise<ArrayBuffer> {
			return new ArrayBuffer(0);
		},
		async deleteFile(path: string): Promise<void> {
			model.local.delete(path);
		},
		async createFolder(): Promise<void> {},
		async fileExists(path: string): Promise<boolean> {
			return model.local.has(path);
		},

		// Server ops
		async pushNotes(updates: NoteUpdate[]): Promise<PushedNote[]> {
			model.pushes.push(updates.map((u) => ({ ...u })));
			const notes: PushedNote[] = [];
			for (const u of updates) {
				model.server.set(u.path, u.content);
				notes.push({ id: "1", path: u.path, assets: [], url: `https://x/${u.path}` });
			}
			return notes;
		},
		async hideNotes(paths: string[]): Promise<void> {
			for (const p of paths) model.server.delete(p);
		},
		async fetchNoteContents(paths: string[]): Promise<NoteContent[]> {
			const out: NoteContent[] = [];
			for (const p of paths) {
				const c = model.server.get(p);
				if (c !== undefined) out.push({ path: p, content: c });
			}
			return out;
		},
		async fetchNoteAssets() {
			return [];
		},
		async uploadAsset(): Promise<boolean> {
			return true;
		},
		async downloadAsset(): Promise<ArrayBuffer | null> {
			return null;
		},
		async commitNotes() {
			return { updated: [] };
		},

		// Asset ops
		async computeBinaryHash(): Promise<string> {
			return "binhash";
		},
		async resolveAssetPath(): Promise<string | null> {
			return null;
		},

		// State
		async saveSyncState(state: SyncState): Promise<void> {
			state.lastSyncedAt = 1;
		},

		// Callbacks
		onProgress(_p: Progress): void {},
		async onConflict() {
			return [];
		},
		async onAssetConflict() {
			return [];
		},
		async onServerDeleted() {
			return false;
		},
		async confirmPush() {
			return true;
		},
	};
	return env;
}

// ============ Harness ============

interface Harness {
	deps: WatchDeps;
	clock: FakeClock;
	model: FakeEnvModel;
	syncState: SyncState;
	deliverSse: (changes: NoteChangeItem[]) => void;
	fireFsEvent: (relPath: string) => void;
	sendSignal: (sig: string) => void;
	livePullConnected: () => boolean;
	disconnected: () => boolean;
	usingFallback: boolean;
}

function makeHarness(opts: {
	local?: Record<string, string>;
	server?: Record<string, string>;
	syncState?: SyncState;
	/** Omit watcherFactory to force the fs.watch fallback path. */
	noWatcherFactory?: boolean;
} = {}): Harness {
	const clock = new FakeClock();
	const model: FakeEnvModel = {
		local: new Map(Object.entries(opts.local ?? {})),
		server: new Map(Object.entries(opts.server ?? {})),
		pushes: [],
	};
	const syncState: SyncState = opts.syncState ?? { files: {} };

	let onChanges: ((c: NoteChangeItem[]) => void) | null = null;
	let connected = false;
	let disconnected = false;
	let fsListener: ((p: string) => void) | null = null;
	let signalHandler: ((s: string) => void) | null = null;

	const deps: WatchDeps = {
		clock: clockClock(clock),
		now: clock.now,
		envFactory: () => makeFakeEnv(model, syncState),
		livePullFactory: (o) => {
			onChanges = o.onChanges;
			return {
				connect() {
					connected = true;
					o.onConnected();
				},
				disconnect() {
					disconnected = true;
				},
			};
		},
		signals: (handler) => {
			signalHandler = handler;
		},
	};

	if (!opts.noWatcherFactory) {
		deps.watcherFactory = () => ({
			onChange(listener) {
				fsListener = listener;
			},
			close() {},
		});
	}

	return {
		deps,
		clock,
		model,
		syncState,
		deliverSse: (c) => onChanges?.(c),
		fireFsEvent: (p) => fsListener?.(p),
		sendSignal: (s) => signalHandler?.(s),
		livePullConnected: () => connected,
		disconnected: () => disconnected,
		usingFallback: !!opts.noWatcherFactory,
	};
}

function baseArgs(): WatchArgs {
	return {
		folder: "/vault",
		apiUrl: "http://localhost:8081/_system/graphql",
		apiKey: "k",
		include: [],
		exclude: [],
		conflictResolution: "local",
	};
}

// ============ Unit tests for helpers ============

describe("createLock", () => {
	it("serializes critical sections in order", async () => {
		const lock = createLock();
		const order: string[] = [];
		const a = lock.run(async () => {
			await flushMicrotasks();
			order.push("a");
		});
		const b = lock.run(async () => {
			order.push("b");
		});
		await Promise.all([a, b]);
		expect(order).toEqual(["a", "b"]);
	});

	it("keeps chain alive after a rejection", async () => {
		const lock = createLock();
		const rejected = lock.run(async () => {
			throw new Error("boom");
		});
		await expect(rejected).rejects.toThrow("boom");
		const ok = await lock.run(async () => 42);
		expect(ok).toBe(42);
	});
});

describe("isWatchablePath", () => {
	it("excludes .trip2g-memory and dotfiles", () => {
		expect(isWatchablePath(".trip2g-memory/x.md")).toBe(false);
		expect(isWatchablePath(".obsidian/data.json")).toBe(false);
		expect(isWatchablePath("a/node_modules/x.md")).toBe(false);
		expect(isWatchablePath("notes/a.md")).toBe(true);
	});
});

// ============ runWatch integration tests ============

describe("runWatch", () => {
	it("push-back guard: SSE-written content does not echo back as a push", async () => {
		const P = "note.md";
		const B = "content B";
		const C = "content C";

		const h = makeHarness({
			local: { [P]: "content A" },
			server: { [P]: "content A" },
			syncState: { files: { [P]: hash("content A") } },
		});

		const run = runWatch(baseArgs(), h.deps);
		await flushMicrotasks(); // let reconcile complete

		expect(h.livePullConnected()).toBe(true);

		// --- SSE delivers content B for P ---
		h.deliverSse([
			{
				__typename: "NoteUpsertEvent",
				path: P,
				eventType: "update",
				versionId: 1,
				title: P,
				noteView: { path: P, content: B },
			},
		]);
		await flushMicrotasks();

		// syncState records hash(B); local file is now B.
		expect(h.syncState.files[P]).toBe(hash(B));
		expect(h.model.local.get(P)).toBe(B);

		const pushesBefore = h.model.pushes.length;

		// --- Fire FS event for P (same content B) -> classify 'unchanged', NO push ---
		h.fireFsEvent(P);
		await h.clock.advance(500);
		await flushMicrotasks();

		// No new push batch with P in it.
		const newBatches = h.model.pushes.slice(pushesBefore);
		const pushedP = newBatches.some((batch) => batch.some((u) => u.path === P));
		expect(pushedP).toBe(false);

		// --- Change P locally to content C -> push happens ---
		h.model.local.set(P, C);
		h.fireFsEvent(P);
		await h.clock.advance(500);
		await flushMicrotasks();

		const allPushed = h.model.pushes.flat();
		const pushOfC = allPushed.find((u) => u.path === P && u.content === C);
		expect(pushOfC).toBeDefined();

		h.sendSignal("SIGINT");
		await run;
	});

	it("debounce batching: multiple FS events in window -> one push batch", async () => {
		const h = makeHarness({
			local: { "a.md": "A", "b.md": "B" },
			server: {},
			syncState: { files: {} },
		});

		const run = runWatch(baseArgs(), h.deps);
		await flushMicrotasks(); // reconcile pushes local_only files (a, b)

		const pushesAfterReconcile = h.model.pushes.length;

		// Multiple FS events within the debounce window.
		h.model.local.set("a.md", "A2");
		h.model.local.set("b.md", "B2");
		h.fireFsEvent("a.md");
		await h.clock.advance(200);
		h.fireFsEvent("b.md");
		await h.clock.advance(200);
		h.fireFsEvent("a.md");
		await h.clock.advance(500); // now fires
		await flushMicrotasks();

		// Exactly one new push batch from the debounced flush.
		const newBatches = h.model.pushes.slice(pushesAfterReconcile);
		expect(newBatches.length).toBe(1);

		h.sendSignal("SIGINT");
		await run;
	});

	it("SSE is gated behind reconcile completion", async () => {
		const P = "gated.md";
		const REMOTE = "remote content";

		// Slow reconcile: block getServerHashes until we release it.
		const clock = new FakeClock();
		const model: FakeEnvModel = {
			local: new Map(),
			server: new Map([[P, REMOTE]]),
			pushes: [],
		};
		const syncState: SyncState = { files: {} };

		let releaseReconcile!: () => void;
		const reconcileGate = new Promise<void>((res) => {
			releaseReconcile = res;
		});

		let onChanges: ((c: NoteChangeItem[]) => void) | null = null;
		let signalHandler: ((s: string) => void) | null = null;

		const env = makeFakeEnv(model, syncState);
		const slowEnv: WatchEnv = {
			...env,
			async getServerHashes() {
				await reconcileGate;
				return env.getServerHashes();
			},
		};

		const deps: WatchDeps = {
			clock: clockClock(clock),
			now: clock.now,
			envFactory: () => slowEnv,
			livePullFactory: (o) => {
				onChanges = o.onChanges;
				return { connect() { o.onConnected(); }, disconnect() {} };
			},
			signals: (handler) => { signalHandler = handler; },
			watcherFactory: () => ({ onChange() {}, close() {} }),
		};

		const run = runWatch(baseArgs(), deps);
		await flushMicrotasks();

		// Deliver SSE before reconcile resolves — must NOT apply yet.
		onChanges?.([
			{
				__typename: "NoteUpsertEvent",
				path: P,
				eventType: "create",
				versionId: 1,
				title: P,
				noteView: { path: P, content: REMOTE },
			},
		]);
		await flushMicrotasks();

		// Not applied: file not written, syncState empty.
		expect(model.local.has(P)).toBe(false);
		expect(syncState.files[P]).toBeUndefined();

		// Release reconcile -> queued SSE batch now applies.
		releaseReconcile();
		await flushMicrotasks();

		expect(model.local.get(P)).toBe(REMOTE);
		expect(syncState.files[P]).toBe(hash(REMOTE));

		signalHandler?.("SIGINT");
		await run;
	});

	it("signal handling: SIGINT awaits in-flight push and persists, exit 0", async () => {
		const h = makeHarness({
			local: { "x.md": "X" },
			server: {},
			syncState: { files: {} },
		});

		const run = runWatch(baseArgs(), h.deps);
		await flushMicrotasks();

		// Start a push then immediately signal.
		h.model.local.set("x.md", "X2");
		h.fireFsEvent("x.md");
		await h.clock.advance(500); // schedule push (enters lock)

		h.sendSignal("SIGINT");
		const result = await run;

		expect(result.exitCode).toBe(0);
		expect(h.disconnected()).toBe(true);
		// State persisted (saveSyncState sets lastSyncedAt).
		expect(h.syncState.lastSyncedAt).toBe(1);
	});

	it("signal handling: SIGINT during reconcile exits cleanly", async () => {
		const clock = new FakeClock();
		const model: FakeEnvModel = { local: new Map(), server: new Map(), pushes: [] };
		const syncState: SyncState = { files: {} };

		let releaseReconcile!: () => void;
		const reconcileGate = new Promise<void>((res) => { releaseReconcile = res; });

		let signalHandler: ((s: string) => void) | null = null;
		const env = makeFakeEnv(model, syncState);
		const slowEnv: WatchEnv = {
			...env,
			async getServerHashes() {
				await reconcileGate;
				return [];
			},
		};

		const deps: WatchDeps = {
			clock: clockClock(clock),
			now: clock.now,
			envFactory: () => slowEnv,
			livePullFactory: (o) => ({ connect() { o.onConnected(); }, disconnect() {} }),
			signals: (handler) => { signalHandler = handler; },
			watcherFactory: () => ({ onChange() {}, close() {} }),
		};

		const run = runWatch(baseArgs(), deps);
		await flushMicrotasks();

		// Signal while reconcile is blocked.
		signalHandler?.("SIGINT");
		await flushMicrotasks();

		// Release so reconcile (and the gated drain) can complete.
		releaseReconcile();
		const result = await run;
		expect(result.exitCode).toBe(0);
	});

	it("fs.watch fallback: 20s sweep triggers a reconcile", async () => {
		// No watcherFactory -> real createWatcher path. chokidar import fails
		// (not installed), so it falls back to fs.watch with a periodic sweep.
		const clock = new FakeClock();
		const model: FakeEnvModel = {
			local: new Map([["sweep.md", "S"]]),
			server: new Map(),
			pushes: [],
		};
		const syncState: SyncState = { files: {} };

		let signalHandler: ((s: string) => void) | null = null;

		const deps: WatchDeps = {
			clock: clockClock(clock),
			now: clock.now,
			envFactory: () => makeFakeEnv(model, syncState),
			livePullFactory: (o) => ({ connect() { o.onConnected(); }, disconnect() {} }),
			signals: (handler) => { signalHandler = handler; },
			// no watcherFactory -> real createWatcher; force fs.watch fallback:
			importChokidar: () => Promise.reject(new Error("no chokidar")),
		};

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-fallback-"));
		const run = runWatch({ ...baseArgs(), folder: tmpDir }, deps);
		await flushMicrotasks();

		const pushesBefore = model.pushes.length;

		// Change content then advance 20s to trigger the sweep reconcile.
		model.local.set("sweep.md", "S2");
		await clock.advance(20000);
		await flushMicrotasks();

		// Sweep reconciled and pushed the local change.
		const pushed = model.pushes.slice(pushesBefore).flat();
		expect(pushed.some((u) => u.path === "sweep.md")).toBe(true);

		signalHandler?.("SIGINT");
		await run;
	});
});
