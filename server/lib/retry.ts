/** Reintento con backoff para fallos transitorios de red (fetch failed, timeout). */
export async function withNetworkRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout|socket hang up/i.test(msg);
      if (!retryable || attempt === maxAttempts) break;
      const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      console.warn(`[retry] ${label} intento ${attempt}/${maxAttempts}: ${msg} — espera ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
