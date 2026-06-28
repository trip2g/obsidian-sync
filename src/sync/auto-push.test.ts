import { describe, it, expect } from "vitest";
import { AutoPushScheduler, type AutoPushClock } from "./auto-push";
import { classifySync } from "./classify";
import { filterPlan } from "./filter";
import { executePlan } from "./execute";
import type {
	SyncState,
	SyncEnv,
	LocalFile,
	ServerHash,
	NoteUpdate,
	PushedNote,
	NoteContent,
	Progress,
} from "./types";

// ============ Fake clock (mirrors src/sync/cli/watch.test.ts) ============

interface ScheduledTimer {
	id: number;
	due: number;
	handler: () => void;
}

class FakeClock implements AutoPushClock {
	private nowMs = 0;
	private nextId = 1;
	private timers = new Map<number, ScheduledTimer>();

	setTimeout = (handler: () => void, ms: number): number => {
		const id = this.nextId++;
		this.timers.set(id, { id, due: this.nowMs + ms, handler });
		return id;
	};
	clearTimeout = (id: number): void => {
		this.timers.delete(id);
	};

	/** Advance virtual time, firing due timers in order, draining microtasks. */
	async advance(ms: number): Promise<void> {
		const target = this.nowMs + ms;
		for (;;) {
			let next: ScheduledTimer | undefined;
			for (const t of this.timers.values()) {
				if (t.due <= target && (next === undefined || t.due < next.due)) {
					next = t;
				}
			}
			if (!next) break;
			this.nowMs = next.due;
			this.timers.delete(next.id);
			next.handler();
			await flushMicrotasks();
		}
		this.nowMs = target;
	}
}

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 60; i++) {
		await Promise.resolve();
	}
}

const DEBOUNCE_MS = 2500;

// ============ Fake env (trimmed from src/sync/cli/watch.test.ts) ============

function hash(content: string): string {
	return `h:${content}`;
}

interface FakeEnvModel {
	local: Map<string, string>;
	server: Map<string, string>;
	pushes: NoteUpdate[][];
}

function makeFakeEnv(model: FakeEnvModel, syncState: SyncState): SyncEnv {
	return {
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

		// Non-interactive callbacks — these mirror buildPushEnv in main.ts:
		// skip every conflict, auto-approve every push.
		onProgress(_p: Progress): void {},
		async onConflict() {
			return []; // skip every conflict (engine defaults missing resolutions to "skip")
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
}

/** The exact shared pipeline runAutoPush/pushSyncDir uses in main.ts. */
async function runPush(env: SyncEnv): Promise<void> {
	const plan = await classifySync(env);
	const filtered = filterPlan(plan, { twoWaySync: true });
	await executePlan(env, filtered, { twoWaySync: true });
}

// ============ Scheduler tests ============

describe("AutoPushScheduler", () => {
	it("(i) edit with auto-sync ON -> after the debounce, exactly one push of that file", async () => {
		const clock = new FakeClock();
		const model: FakeEnvModel = {
			local: new Map([["a.md", "A"]]),
			server: new Map([["a.md", "A"]]),
			pushes: [],
		};
		const syncState: SyncState = { files: { "a.md": hash("A") } };

		let flushCalls = 0;
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => true,
			isBusy: () => false,
			flush: async (paths) => {
				flushCalls++;
				expect(paths).toEqual(["a.md"]);
				await runPush(makeFakeEnv(model, syncState));
			},
			clock,
		});

		// User edits a.md, Obsidian fires "modify".
		model.local.set("a.md", "A2");
		scheduler.schedule("a.md");

		// Nothing fires before the debounce window elapses.
		await clock.advance(DEBOUNCE_MS - 1);
		expect(flushCalls).toBe(0);

		await clock.advance(1);
		await flushMicrotasks();

		expect(flushCalls).toBe(1);
		const pushedA = model.pushes.flat().filter((u) => u.path === "a.md");
		expect(pushedA.length).toBe(1);
		expect(pushedA[0].content).toBe("A2");
	});

	it("coalesces a burst of edits into a single flush", async () => {
		const clock = new FakeClock();
		const flushed: string[][] = [];
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => true,
			isBusy: () => false,
			flush: async (paths) => {
				flushed.push(paths);
			},
			clock,
		});

		scheduler.schedule("a.md");
		await clock.advance(1000);
		scheduler.schedule("b.md");
		await clock.advance(1000);
		scheduler.schedule("a.md");
		await clock.advance(DEBOUNCE_MS);
		await flushMicrotasks();

		expect(flushed.length).toBe(1);
		expect(flushed[0].sort()).toEqual(["a.md", "b.md"]);
	});

	it("(ii) a live-pull self-write does NOT echo back as an auto-push", async () => {
		const clock = new FakeClock();
		const flushed: string[][] = [];
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => true,
			isBusy: () => false,
			flush: async (paths) => {
				flushed.push(paths);
			},
			clock,
		});

		// Live-pull is about to write live.md -> suppress its echo, then the
		// resulting "modify" event arrives.
		scheduler.suppress(["live.md"]);
		scheduler.schedule("live.md");
		await clock.advance(DEBOUNCE_MS);
		await flushMicrotasks();

		// Echo swallowed: no flush.
		expect(flushed.length).toBe(0);

		// One-shot: a subsequent REAL edit of the same file still pushes.
		scheduler.schedule("live.md");
		await clock.advance(DEBOUNCE_MS);
		await flushMicrotasks();
		expect(flushed.length).toBe(1);
		expect(flushed[0]).toEqual(["live.md"]);
	});

	it("(ii engine) a file already at the live-pulled hash classifies unchanged -> no push", async () => {
		// Invariant (a): live-pull recorded syncState[path] = remoteHash, so when
		// the auto-push reconcile re-reads it, local == remote == lastSynced.
		const model: FakeEnvModel = {
			local: new Map([["live.md", "B"]]),
			server: new Map([["live.md", "B"]]),
			pushes: [],
		};
		const syncState: SyncState = { files: { "live.md": hash("B") } };

		await runPush(makeFakeEnv(model, syncState));

		expect(model.pushes.flat().some((u) => u.path === "live.md")).toBe(false);
	});

	it("(iii) a conflicting file is SKIPPED (not clobbered); non-conflicting files still push", async () => {
		const model: FakeEnvModel = {
			local: new Map([
				["conflict.md", "local-edit"],
				["clean.md", "v2"],
			]),
			server: new Map([
				["conflict.md", "remote-edit"],
				["clean.md", "v1"],
			]),
			pushes: [],
		};
		// conflict.md: base synced, both sides diverged -> conflict.
		// clean.md: remote == lastSynced, local changed -> push.
		const syncState: SyncState = {
			files: { "conflict.md": hash("base"), "clean.md": hash("v1") },
		};

		await runPush(makeFakeEnv(model, syncState));

		const pushedPaths = model.pushes.flat().map((u) => u.path);
		// Conflict pushed nowhere and left untouched on both sides.
		expect(pushedPaths).not.toContain("conflict.md");
		expect(model.server.get("conflict.md")).toBe("remote-edit");
		expect(model.local.get("conflict.md")).toBe("local-edit");
		expect(syncState.files["conflict.md"]).toBe(hash("base"));
		// Non-conflicting bucket still pushed.
		expect(pushedPaths).toContain("clean.md");
		expect(model.server.get("clean.md")).toBe("v2");
	});

	it("(iv) auto-sync OFF -> scheduling never fires a flush", async () => {
		const clock = new FakeClock();
		let flushCalls = 0;
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => false,
			isBusy: () => false,
			flush: async () => {
				flushCalls++;
			},
			clock,
		});

		scheduler.schedule("a.md");
		await clock.advance(DEBOUNCE_MS * 4);
		await flushMicrotasks();

		expect(flushCalls).toBe(0);
	});

	it("queues on isBusy: re-arms while a manual sync runs, flushes once it clears", async () => {
		const clock = new FakeClock();
		let busy = true;
		let flushCalls = 0;
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => true,
			isBusy: () => busy,
			flush: async () => {
				flushCalls++;
			},
			clock,
		});

		scheduler.schedule("a.md");
		await clock.advance(DEBOUNCE_MS);
		await flushMicrotasks();
		expect(flushCalls).toBe(0); // busy -> re-armed, did not run

		busy = false;
		await clock.advance(DEBOUNCE_MS);
		await flushMicrotasks();
		expect(flushCalls).toBe(1);
	});

	it("cancel() stops a pending flush", async () => {
		const clock = new FakeClock();
		let flushCalls = 0;
		const scheduler = new AutoPushScheduler({
			debounceMs: DEBOUNCE_MS,
			isEnabled: () => true,
			isBusy: () => false,
			flush: async () => {
				flushCalls++;
			},
			clock,
		});

		scheduler.schedule("a.md");
		scheduler.cancel();
		await clock.advance(DEBOUNCE_MS * 2);
		await flushMicrotasks();
		expect(flushCalls).toBe(0);
	});
});
