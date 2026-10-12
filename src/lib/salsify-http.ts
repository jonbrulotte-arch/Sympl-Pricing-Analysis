// Hardened fetch wrapper for all Salsify API calls: retries transient failures with
// backoff + jitter, honors Retry-After on 429, times out each attempt, and produces
// human-readable errors instead of bare "fetch failed".

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);
const MAX_RETRY_AFTER_MS = 10_000;

export interface SalsifyFetchOptions extends RequestInit {
  attempts?: number;
  timeoutMs?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  return 250 * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds)) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/** Walks the `cause` chain on a fetch/network error to produce a readable message. */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as NodeJS.ErrnoException).code;
    parts.push(code ? `${code}: ${current.message}` : current.message);
    current = current.cause;
  }
  return parts.join(" — ") || err.message || "fetch failed";
}

function networkErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as NodeJS.ErrnoException).code;
    if (code) return code;
    current = current.cause;
  }
  return undefined;
}

/**
 * Fetches a Salsify URL with retries on transient HTTP/network errors.
 * Non-retryable responses (404, 422, etc.) are returned as-is for the caller to handle.
 * Throws only when every attempt is exhausted or a non-retryable network error occurs.
 */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export async function salsifyFetch(url: string, options: SalsifyFetchOptions = {}): Promise<Response> {
  const { attempts = 3, timeoutMs = 20_000, signal: externalSignal, ...init } = options;
  const method = init.method ?? "GET";
  const label = `${method} ${shortUrl(url)}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
    const startedAt = Date.now();

    try {
      const res = await fetch(url, { ...init, signal });
      const durationMs = Date.now() - startedAt;

      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === attempts) {
        console.log(`[salsify] ${label} → ${res.status} in ${durationMs}ms (attempt ${attempt}/${attempts})`);
        return res;
      }

      const wait = retryAfterMs(res) ?? backoffDelay(attempt);
      console.warn(`[salsify] ${label} → ${res.status} in ${durationMs}ms (attempt ${attempt}/${attempts}), retrying in ${Math.round(wait)}ms`);
      await sleep(wait);
      continue;
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      lastError = err;
      const code = networkErrorCode(err);
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      const retryable = isTimeout || (code != null && RETRYABLE_NETWORK_CODES.has(code));
      const description = isTimeout ? `timed out after ${timeoutMs / 1000}s` : describeFetchError(err);

      if (!retryable || attempt === attempts) {
        console.error(`[salsify] ${label} failed after ${durationMs}ms (attempt ${attempt}/${attempts}): ${description} — giving up`);
        throw new Error(isTimeout ? `Timed out after ${timeoutMs / 1000}s` : description);
      }

      const wait = backoffDelay(attempt);
      console.warn(`[salsify] ${label} failed after ${durationMs}ms (attempt ${attempt}/${attempts}): ${description}, retrying in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }

  throw new Error(lastError ? describeFetchError(lastError) : "Salsify request failed");
}
