import { describe, it, expect } from "vitest";
import { SyncFailureTracker, classifyFailure } from "./failure-tracker";

// A graphql-request ClientError carries the HTTP status on `.response.status`.
function httpError(status: number, message = "request failed"): Error {
	const err = new Error(message) as Error & { response: { status: number } };
	err.response = { status };
	return err;
}

describe("classifyFailure", () => {
	it("classifies 401/403 as auth", () => {
		expect(classifyFailure(httpError(401))).toBe("auth");
		expect(classifyFailure(httpError(403))).toBe("auth");
	});

	it("classifies auth-ish messages as auth even without a status", () => {
		expect(classifyFailure(new Error("Unauthorized"))).toBe("auth");
		expect(classifyFailure(new Error("invalid API key"))).toBe("auth");
	});

	it("classifies network/server errors as other", () => {
		expect(classifyFailure(httpError(500))).toBe("other");
		expect(classifyFailure(new Error("Failed to fetch"))).toBe("other");
		expect(classifyFailure(new Error("ECONNREFUSED"))).toBe("other");
	});
});

describe("SyncFailureTracker", () => {
	const KEY = "https://site\n/notes";

	it("notifies on the first failure (transition into failing)", () => {
		const t = new SyncFailureTracker();
		const notice = t.recordFailure(KEY, httpError(401));
		expect(notice).not.toBeNull();
		expect(notice?.kind).toBe("auth");
	});

	it("stays quiet on repeated failures of the same kind (debounce)", () => {
		const t = new SyncFailureTracker();
		expect(t.recordFailure(KEY, httpError(401))).not.toBeNull();
		expect(t.recordFailure(KEY, httpError(401))).toBeNull();
		expect(t.recordFailure(KEY, httpError(401))).toBeNull();
	});

	it("re-notifies when the failure kind escalates to auth", () => {
		const t = new SyncFailureTracker();
		expect(t.recordFailure(KEY, httpError(500))?.kind).toBe("other");
		// same non-auth kind -> quiet
		expect(t.recordFailure(KEY, httpError(500))).toBeNull();
		// escalation to auth -> notify again
		expect(t.recordFailure(KEY, httpError(401))?.kind).toBe("auth");
	});

	it("resets after a success, so a later failure notifies again", () => {
		const t = new SyncFailureTracker();
		expect(t.recordFailure(KEY, httpError(401))).not.toBeNull();
		t.recordSuccess(KEY);
		expect(t.isFailing(KEY)).toBe(false);
		expect(t.recordFailure(KEY, httpError(401))).not.toBeNull();
	});

	it("does not notify for a one-off transient failure that recovers", () => {
		// A single blip followed by success: the blip DOES fire one Notice (we can't
		// see the future), but recovery clears state so we don't nag afterwards.
		const t = new SyncFailureTracker();
		t.recordFailure(KEY, httpError(503));
		t.recordSuccess(KEY);
		expect(t.anyFailing()).toBe(false);
	});

	it("tracks targets independently", () => {
		const t = new SyncFailureTracker();
		const A = "a";
		const B = "b";
		expect(t.recordFailure(A, httpError(401))).not.toBeNull();
		// B is a fresh target -> also notifies
		expect(t.recordFailure(B, httpError(401))).not.toBeNull();
		expect(t.anyFailing()).toBe(true);
		t.recordSuccess(A);
		expect(t.isFailing(A)).toBe(false);
		expect(t.isFailing(B)).toBe(true);
	});
});
