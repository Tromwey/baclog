/**
 * Outcome of a per-service exact-link resolver (brief "link-out post-Odesli",
 * fase 2). Three states on purpose — the caller caches them differently:
 *   - exact        → cache the URL with isSearchFallback = false
 *   - none         → a real "no confident match": cache the search fallback
 *                    (isSearchFallback = true) so we never re-query for it
 *   - unavailable  → transient (no key configured, 429/5xx, timeout, bad
 *                    token): return the search fallback WITHOUT caching, so
 *                    the next tap retries instead of freezing a bad answer
 */
export type ResolveOutcome =
  | { kind: "exact"; url: string }
  | { kind: "none" }
  | { kind: "unavailable"; reason: string };

/** What a resolver needs to know about the catalog title. Kept minimal and
 *  isomorphic (no DB types) so the matcher can be unit-tested with tsx. */
export interface AlbumQuery {
  title: string;
  /** Artist line as the catalog stores it ("A, B & C" from iTunes). */
  byline: string | null;
  year: number | null;
}

/** A candidate album as returned by an upstream search. */
export interface AlbumCandidate {
  id: string;
  title: string;
  /** Individual credited artists (already split by the upstream). */
  artists: string[];
  /** ISO date or year; null when unknown. */
  releaseDate: string | null;
  albumType: "ALBUM" | "EP" | "SINGLE" | null;
}
