import { t } from "../i18n";

/**
 * Thrown for a deterministically non-retryable upload failure (HTTP 413,
 * payload too large). Its message is the user-facing `assetTooLarge` string.
 */
export class AssetTooLargeError extends Error {
	readonly fileName: string;

	constructor(fileName: string) {
		super(t().assetTooLarge(fileName));
		this.name = "AssetTooLargeError";
		this.fileName = fileName;
	}
}

/** An upload error that must not be retried (fail fast). */
export function isNonRetryableUploadError(e: unknown): boolean {
	return e instanceof AssetTooLargeError;
}

export interface UploadRetryOptions {
	maxRetries?: number;
	/** Called before each backoff wait (retryable failures only). */
	onRetry?: (attempt: number, error: unknown) => void;
	/** Called once when giving up (exhausted retries or non-retryable). */
	onGiveUp?: (error: unknown, attempts: number) => void;
	/** Injectable delay; defaults to real setTimeout backoff. */
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run an upload `attempt` with exponential backoff. A non-retryable error
 * (e.g. HTTP 413 asset too large) fails fast after a single attempt; transient
 * errors are retried up to `maxRetries` times.
 */
export async function uploadWithRetry(
	attempt: () => Promise<boolean>,
	opts: UploadRetryOptions = {}
): Promise<boolean> {
	const maxRetries = opts.maxRetries ?? 10;
	const sleep = opts.sleep ?? defaultSleep;

	for (let n = 1; n <= maxRetries; n++) {
		try {
			if (await attempt()) {
				return true;
			}
		} catch (e) {
			if (isNonRetryableUploadError(e)) {
				opts.onGiveUp?.(e, n);
				return false;
			}
			if (n < maxRetries) {
				opts.onRetry?.(n, e);
				await sleep(Math.pow(2, n - 1) * 1000);
				continue;
			}
			opts.onGiveUp?.(e, n);
			return false;
		}
	}
	return false;
}
