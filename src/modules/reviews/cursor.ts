/**
 * `${iso}|${id}` keyset cursor codec — shared by the review feed and the
 * social module (feed, following, followers), so the two can never disagree
 * on the format. PURE (no DB, no "server-only") so `scripts/check-wire.ts`
 * can assert it under tsx; `reviews/queries.ts` re-exports both halves.
 *
 * BOTH halves live here: every producer goes through `encodeCursor`, so a
 * format change can't leave a stale hand-built encoder behind (`decodeCursor`
 * answers null to one, and the API turns that into a 400 instead of silently
 * re-serving page 1 forever).
 */

/** Exactly what `encodeCursor` emits for the instant half: `Date#toISOString`
 *  (milliseconds optional so a hand-trimmed cursor from a test still reads). */
const CURSOR_AT_RE = /^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** No row in this product predates 2000; a year below that is a forged
 *  cursor. It matters beyond hygiene: Postgres rejects the ISO string of year
 *  0000 or a negative year, which used to surface as a 500 on every keyset
 *  list (`/feed`, `/me/following`, `/me/followers`, `/titles/{id}/reviews`). */
const CURSOR_MIN_YEAR = 2000;

export function encodeCursor(at: Date | string, id: string): string {
  return `${typeof at === "string" ? at : at.toISOString()}|${id}`;
}

/**
 * The cursor's `{ at, id }`, or null when it isn't one `encodeCursor` could
 * have produced. Only the INSTANT half is validated here: the id half is
 * opaque to this codec (the feed uses composite ids like `reviewed:<uuid>`),
 * so a caller that knows its id shape checks it itself (`readCursor`'s
 * `uuidId` in `api/v1/_lib/http.ts`).
 */
export function decodeCursor(
  cursor: string | null,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.lastIndexOf("|");
  if (sep < 1) return null;
  const half = cursor.slice(0, sep);
  const id = cursor.slice(sep + 1);
  if (!id) return null;
  const m = CURSOR_AT_RE.exec(half);
  if (!m || Number(m[1]) < CURSOR_MIN_YEAR) return null;
  const at = new Date(half);
  if (Number.isNaN(at.getTime())) return null;
  // `Date` rolls impossible days over (2026-02-30 → 03-02): a round trip
  // that doesn't give the same wall-clock back was never a real instant.
  if (at.toISOString().slice(0, 19) !== half.slice(0, 19)) return null;
  return { at, id };
}
