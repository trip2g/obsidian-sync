// Decides when a background sync failure should surface a Notice to the user.
// Background push/pull/poll errors are otherwise console-only, so a user with an
// expired API key keeps "saving" into the void. We debounce by state transition:
// notify once when a target goes healthy -> failing (and again if the failure
// kind changes, e.g. a flaky network error turns into an auth rejection), then
// stay quiet until it recovers. Transient one-off blips that recover on the next
// attempt never notify.

export type FailureKind = "auth" | "other";

export interface FailureNotice {
	kind: FailureKind;
	/** The underlying error message, for logs / detail. */
	message: string;
}

/** Best-effort HTTP status extraction from a graphql-request ClientError / fetch error. */
function errorStatus(error: unknown): number | undefined {
	const resp = (error as { response?: { status?: unknown } } | undefined)?.response;
	const status = resp?.status;
	return typeof status === "number" ? status : undefined;
}

export function classifyFailure(error: unknown): FailureKind {
	const status = errorStatus(error);
	if (status === 401 || status === 403) return "auth";
	const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
	if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("api key")) {
		return "auth";
	}
	return "other";
}

/**
 * Per-target (keyed) failure state machine. A "target" is a syncDir; the key is
 * usually `apiUrl + "\n" + path`. Call recordFailure on a background error and
 * recordSuccess after a clean sync; recordFailure returns a FailureNotice only
 * when the caller should actually show one.
 */
export class SyncFailureTracker {
	private failing = new Map<string, FailureKind>();

	/**
	 * @returns a FailureNotice if the user should be notified now, else null.
	 */
	recordFailure(key: string, error: unknown): FailureNotice | null {
		const kind = classifyFailure(error);
		const prev = this.failing.get(key);
		this.failing.set(key, kind);
		// Notify on transition into failure, or when the failure kind escalates/changes.
		if (prev === kind) return null;
		const message = error instanceof Error ? error.message : String(error ?? "");
		return { kind, message };
	}

	/** Clear failure state for a target after a successful sync. */
	recordSuccess(key: string): void {
		this.failing.delete(key);
	}

	/** True if the given target is currently in a failing state. */
	isFailing(key: string): boolean {
		return this.failing.has(key);
	}

	/** True if any target is currently failing (for a global ribbon indicator). */
	anyFailing(): boolean {
		return this.failing.size > 0;
	}
}
