/**
 * Pure-JS SSE client for the `noteChanges` GraphQL subscription.
 *
 * graphql-request cannot stream responses, so we use `fetch` +
 * `response.body.getReader()` directly and parse the SSE wire format
 * line-by-line (`event:` / `data:`), exactly like assets/ui/sse/sse.ts.
 *
 * The connection is self-reconnecting with exponential backoff and a
 * health-check that aborts a stale stream (no bytes, including keepalive,
 * for longer than the health-check interval) and reconnects.
 */

/** A single change item from a NoteChangesSubscriptionPayload. */
export type NoteChangeItem = NoteUpsertChange | NoteHideChange;

export interface NoteUpsertChange {
	__typename: "NoteUpsertEvent";
	path: string;
	eventType: "create" | "update";
	versionId: number;
	title: string;
	noteView: { path: string; content: string } | null;
}

export interface NoteHideChange {
	__typename: "NoteHideEvent";
	path: string;
}

export interface LivePullConnectionOptions {
	/** Site URL (already normalized, no trailing slash). */
	apiUrl: string;
	apiKey: string;
	pluginVersion: string;
	includePatterns: string[];
	excludePatterns?: string[];
	/** Fires after the stream is established (HTTP 200, reader open). */
	onConnected: () => void;
	/** Fires for every received batch of changes. */
	onChanges: (changes: NoteChangeItem[]) => void;
}

const SUBSCRIPTION_DOCUMENT = `subscription NoteChanges($filter: NoteChangesFilter!) {
	noteChanges(filter: $filter) {
		changes {
			__typename
			... on NoteUpsertEvent {
				path
				eventType
				versionId
				title
				noteView { path content }
			}
			... on NoteHideEvent {
				path
			}
		}
	}
}`;

const BACKOFF_MS = [3000, 6000, 12000, 30000];
const HEALTH_CHECK_INTERVAL_MS = 60000;

export class LivePullConnection {
	private readonly options: LivePullConnectionOptions;
	private abort: AbortController | null = null;
	private stopped = false;
	private backoffIndex = 0;
	private lastByteAt = 0;
	private healthTimer: ReturnType<typeof setInterval> | null = null;

	constructor(options: LivePullConnectionOptions) {
		this.options = options;
	}

	/** Start the self-reconnecting stream loop. Safe to call once. */
	connect(): void {
		if (!this.stopped && this.abort) {
			return; // already running
		}
		this.stopped = false;
		this.startHealthCheck();
		void this.loop();
	}

	/** Stop the stream and cleanup. Safe to call multiple times. */
	disconnect(): void {
		this.stopped = true;
		this.stopHealthCheck();
		if (this.abort) {
			this.abort.abort();
			this.abort = null;
		}
	}

	/**
	 * If the stream looks dead (no bytes for longer than the health interval),
	 * abort the current connection so the loop reconnects. Used on window focus.
	 */
	reconnectIfDead(): void {
		if (this.stopped) {
			return;
		}
		if (!this.abort) {
			// Loop is between attempts (sleeping in backoff) — restart it.
			this.connect();
			return;
		}
		if (Date.now() - this.lastByteAt > HEALTH_CHECK_INTERVAL_MS) {
			this.abort.abort(); // loop will reconnect
		}
	}

	private startHealthCheck(): void {
		this.stopHealthCheck();
		this.healthTimer = setInterval(() => {
			if (this.stopped || !this.abort) {
				return;
			}
			if (Date.now() - this.lastByteAt > HEALTH_CHECK_INTERVAL_MS) {
				this.abort.abort(); // stale stream — loop reconnects
			}
		}, HEALTH_CHECK_INTERVAL_MS);
	}

	private stopHealthCheck(): void {
		if (this.healthTimer !== null) {
			clearInterval(this.healthTimer);
			this.healthTimer = null;
		}
	}

	private async loop(): Promise<void> {
		while (!this.stopped) {
			try {
				await this.stream();
				// Clean end of stream: reset backoff so a quick reconnect follows.
				this.backoffIndex = 0;
			} catch (e) {
				if (this.stopped) {
					return;
				}
				console.warn("[Trip2g Sync] Live-pull stream error:", e);
			}

			if (this.stopped) {
				return;
			}

			const delay = BACKOFF_MS[Math.min(this.backoffIndex, BACKOFF_MS.length - 1)];
			this.backoffIndex++;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	private async stream(): Promise<void> {
		const abort = new AbortController();
		this.abort = abort;
		this.lastByteAt = Date.now();

		const response = await fetch(`${this.options.apiUrl}/_system/graphql`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
				"X-API-Key": this.options.apiKey,
				"X-Plugin-Version": this.options.pluginVersion,
			},
			body: JSON.stringify({
				query: SUBSCRIPTION_DOCUMENT,
				variables: {
					filter: {
						includePatterns: this.options.includePatterns,
						excludePatterns: this.options.excludePatterns ?? [],
					},
				},
			}),
			signal: abort.signal,
		});

		if (!response.ok || !response.body) {
			throw new Error(`Live-pull: ${response.status} ${response.statusText}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let eventType = "";

		// Stream established.
		this.backoffIndex = 0;
		this.lastByteAt = Date.now();
		this.options.onConnected();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				this.lastByteAt = Date.now();

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					if (line.startsWith("event:")) {
						eventType = line.slice(6).trim();
					} else if (line.startsWith("data:")) {
						const payload = line.slice(5).trim();
						if (eventType === "next") {
							this.handleNext(payload);
						} else if (eventType === "complete") {
							return;
						}
						eventType = "";
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	private handleNext(payload: string): void {
		let parsed: {
			errors?: unknown;
			data?: { noteChanges?: { changes?: NoteChangeItem[] } };
		};
		try {
			parsed = JSON.parse(payload);
		} catch (e) {
			console.warn("[Trip2g Sync] Live-pull bad payload:", e);
			return;
		}
		if (parsed.errors) {
			console.warn("[Trip2g Sync] Live-pull subscription error:", parsed.errors);
			return;
		}
		const changes = parsed.data?.noteChanges?.changes;
		if (changes && changes.length > 0) {
			this.options.onChanges(changes);
		}
	}
}
