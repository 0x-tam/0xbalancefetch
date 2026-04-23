import { logger } from "./logger";

export interface RetryOptions {
  maxRetries: number;
  backoffBaseMs: number;
  /** Return true if this error is retryable (e.g. 429, 5xx). */
  isRetryable?: (err: unknown) => boolean;
}

function defaultIsRetryable(err: unknown): boolean {
  if (err && typeof err === "object" && "response" in err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === undefined) return true; // network error
    return status === 429 || (status >= 500 && status < 600);
  }
  return true; // unknown errors are retried
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > opts.maxRetries || !isRetryable(err)) {
        throw err;
      }
      const delayMs = opts.backoffBaseMs * Math.pow(2, attempt - 1);
      logger.warn(`${label}: attempt ${attempt}/${opts.maxRetries} failed, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
