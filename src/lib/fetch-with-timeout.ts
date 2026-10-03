/**
 * `fetch` with a deadline. A provider that accepts the connection and then
 * never answers (TMDB and iTunes both do it under load) otherwise holds the
 * request — and the serverless function behind it — until the platform kills
 * it at `maxDuration`, with nothing in the log.
 *
 * The timeout surfaces as the usual rejected promise (`TimeoutError`), so
 * every caller's existing `catch` treats it like any other network failure.
 * A caller-provided `signal` is combined with the deadline, never replaced.
 *
 * Next's `next: { revalidate }` and every other `RequestInit` field pass
 * through untouched.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = init ?? {};
  const deadline = AbortSignal.timeout(timeoutMs);
  return fetch(input, {
    ...rest,
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
}
