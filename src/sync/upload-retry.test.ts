import { describe, it, expect, vi } from "vitest";
import { uploadWithRetry, AssetTooLargeError, isNonRetryableUploadError } from "./upload-retry";
import { t } from "../i18n";

describe("uploadWithRetry", () => {
	const noSleep = async () => {};

	it("fails fast on a 413 AssetTooLargeError — exactly ONE attempt, no retries", async () => {
		const attempt = vi.fn(async () => {
			throw new AssetTooLargeError("big.png");
		});

		const result = await uploadWithRetry(attempt, { sleep: noSleep });

		expect(result).toBe(false);
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	it("surfaces the assetTooLarge i18n string on a non-retryable failure", () => {
		const err = new AssetTooLargeError("big.png");
		expect(err.message).toBe(t().assetTooLarge("big.png"));
		expect(isNonRetryableUploadError(err)).toBe(true);
		expect(isNonRetryableUploadError(new Error("boom"))).toBe(false);
	});

	it("retries a transient 5xx failure and eventually succeeds", async () => {
		let calls = 0;
		const attempt = vi.fn(async () => {
			calls++;
			if (calls < 3) throw new Error("HTTP 503: Service Unavailable");
			return true;
		});

		const result = await uploadWithRetry(attempt, { sleep: noSleep });

		expect(result).toBe(true);
		expect(attempt).toHaveBeenCalledTimes(3);
	});

	it("retries a persistent transient error up to maxRetries then gives up", async () => {
		const attempt = vi.fn(async () => {
			throw new Error("HTTP 500");
		});

		const result = await uploadWithRetry(attempt, { maxRetries: 4, sleep: noSleep });

		expect(result).toBe(false);
		expect(attempt).toHaveBeenCalledTimes(4);
	});
});
