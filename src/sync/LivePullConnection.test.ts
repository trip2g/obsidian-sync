import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LivePullConnection } from "./LivePullConnection";

/**
 * Minimal options for LivePullConnection.
 * Uses vi.fn() stubs for the callbacks; fetch is mocked per-test.
 */
function makeOptions(overrides: Partial<Parameters<typeof LivePullConnection.prototype.constructor>[0]> = {}) {
	return {
		apiUrl: "https://example.com",
		apiKey: "test-key",
		pluginVersion: "1.0.0",
		includePatterns: ["**/*.md"],
		onConnected: vi.fn(),
		onChanges: vi.fn(),
		...overrides,
	};
}

/**
 * Returns a mock fetch that immediately throws an AbortError (DOMException),
 * simulating the connection being aborted right after the URL is captured.
 * This prevents the loop from trying to read a response body.
 */
function makeFetchCapture() {
	let capturedUrl: string | undefined;
	const fetchMock = vi.fn(async (url: string | URL | Request) => {
		capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
		// Throw AbortError to stop the streaming loop without needing a real response.
		const err = new DOMException("Aborted", "AbortError");
		throw err;
	});
	return { fetchMock, getCapturedUrl: () => capturedUrl };
}

describe("LivePullConnection — request URL", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("appends /_system/graphql to apiUrl when endpoint is not set", async () => {
		const { fetchMock, getCapturedUrl } = makeFetchCapture();
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		const conn = new LivePullConnection(makeOptions());
		conn.connect();

		// Give the async loop one tick to run and call fetch.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		conn.disconnect();

		expect(getCapturedUrl()).toBe("https://example.com/_system/graphql");
	});

	it("uses the verbatim endpoint when endpoint is set", async () => {
		const { fetchMock, getCapturedUrl } = makeFetchCapture();
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		const conn = new LivePullConnection(
			makeOptions({ endpoint: "https://custom.host/api/graphql" }),
		);
		conn.connect();

		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		conn.disconnect();

		expect(getCapturedUrl()).toBe("https://custom.host/api/graphql");
	});

	it("endpoint overrides apiUrl entirely (does not append /_system/graphql)", async () => {
		const { fetchMock, getCapturedUrl } = makeFetchCapture();
		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		const conn = new LivePullConnection(
			makeOptions({
				apiUrl: "https://example.com",
				endpoint: "https://other.example.com/gql",
			}),
		);
		conn.connect();

		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		conn.disconnect();

		const url = getCapturedUrl();
		expect(url).toBe("https://other.example.com/gql");
		expect(url).not.toContain("/_system/graphql");
	});
});
