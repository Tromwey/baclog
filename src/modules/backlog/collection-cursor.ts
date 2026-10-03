import { decodeCursor, encodeCursor } from "@/modules/reviews/cursor";

/**
 * Colecciones largas (founder, ronda 8): a collection's titles arrive by
 * pages of 60 as the page scrolls. This is the keyset cursor of that list —
 * PURE (no DB, no "server-only", no React) so `collection-cursor.test.ts`
 * asserts it under tsx and both sides (the reader in
 * `modules/backlog/queries.ts`, the action, the client's optimistic paint)
 * read the same definition.
 *
 * ONE cursor shape per order the collection offers, because a keyset is only
 * stable when it carries every column of its ORDER BY down to a unique one:
 *
 *   manual  position ASC NULLS FIRST · addedAt DESC · id DESC
 *   recent  addedAt DESC · position ASC NULLS FIRST · id DESC
 *   state   rank ASC (obsesiona 0 · gusta 1 · completo 2 · nada 3) · then manual
 *   year    year DESC NULLS LAST · then manual
 *
 * Every order falls back to the MANUAL one on a tie, because that is what the
 * web showed before paging (a stable client sort over the manual list). It
 * matters for "recientes": a copied collection is 40 titles added in the same
 * instant, and without `position` there they would read in the order of
 * their random ids (found by the DB harness, 2026-10-01). `id` only breaks
 * what the manual order itself leaves undefined.
 *
 * "Título" is NOT here on purpose (the tripwire of the round): today it
 * sorts with `localeCompare(…, "es", { sensitivity: "base" })`, and no SQL
 * ORDER BY reproduces that without a collation the schema doesn't declare
 * (the database's default would put "Élite" after "Zodiac"). That one order
 * reads the whole collection once and sorts in the client, as before.
 *
 * Wire form: `${sort}~${lead}~${iso}|${id}~${backlogId}` — `lead` is the
 * order's integer keys, comma-separated, `-` for null; the last part is the
 * collection the cursor was cut from, so a cursor of another collection is
 * refused like one of another order (not a secret: the reader is scoped to
 * the caller's own collection either way). The instant + id pair is
 * exactly `reviews/cursor.ts`' `encodeCursor`, so the instant half gets the
 * validation that learning 2026-09-24 paid for (exact ISO shape, year ≥
 * 2000, round trip) instead of `new Date()`'s permissive parse.
 */

export const COLLECTION_PAGE_SIZE = 60;
/** The most rows one call returns: a refresh re-reads everything already on
 *  screen in ONE call, so a mutation never leaves a half-stale list. */
export const COLLECTION_WINDOW_MAX = 600;

export const PAGED_SORTS = ["manual", "recent", "state", "year"] as const;
export type PagedSort = (typeof PAGED_SORTS)[number];

export function isPagedSort(sort: string): sort is PagedSort {
  return (PAGED_SORTS as readonly string[]).includes(sort);
}

interface LeadKey {
  name: "position" | "rank" | "year";
  nullable: boolean;
  min: number;
  max: number;
}

const POSITION: LeadKey = { name: "position", nullable: true, min: 0, max: 2_147_483_647 };

const RANK: LeadKey = { name: "rank", nullable: false, min: 0, max: 3 };
const YEAR: LeadKey = { name: "year", nullable: true, min: 0, max: 9999 };

export type CursorKeyName = LeadKey["name"] | "at" | "id";

/** Each order as its full key list, most significant first — THE definition:
 *  `compareRows` here and the ORDER BY / keyset in queries.ts both walk it. */
export const CURSOR_ORDER: Record<PagedSort, readonly CursorKeyName[]> = {
  manual: ["position", "at", "id"],
  recent: ["at", "position", "id"],
  state: ["rank", "position", "at", "id"],
  year: ["year", "position", "at", "id"],
};

/** The integer keys of each order (what `lead` carries), in `CURSOR_ORDER`'s
 *  order. */
export const CURSOR_LEAD: Record<PagedSort, readonly LeadKey[]> = {
  manual: [POSITION],
  recent: [POSITION],
  state: [RANK, POSITION],
  year: [YEAR, POSITION],
};

export interface CollectionCursor {
  sort: PagedSort;
  /** One value per `CURSOR_LEAD[sort]` key, in order. */
  lead: (number | null)[];
  at: Date;
  /** `backlog_item.id`. */
  id: string;
}

/** The "Estado" order's rank — the SQL twin is `STATE_RANK` in queries.ts,
 *  the glyph twin `glyphOf` in collection-shared.ts. Keep the three in step. */
export function stateRank(it: { obsessed: boolean; verdict: string | null; status: string }): number {
  if (it.obsessed) return 0;
  if (it.verdict === "liked") return 1;
  if (it.status === "completed") return 2;
  return 3;
}

/** What a cursor is made from: the last row of a page. */
export interface CursorRow {
  id: string;
  position: number | null;
  addedAt: Date | string;
  year: number | null;
  obsessed: boolean;
  verdict: string | null;
  status: string;
}

export function cursorOf(sort: PagedSort, row: CursorRow): CollectionCursor {
  const lead = CURSOR_LEAD[sort].map((k) =>
    k.name === "position" ? row.position : k.name === "year" ? row.year : stateRank(row),
  );
  return { sort, lead, at: new Date(row.addedAt), id: row.id };
}

export function encodeCollectionCursor(c: CollectionCursor, backlogId: string): string {
  const lead = c.lead.map((v) => (v === null ? "-" : String(v))).join(",");
  return `${c.sort}~${lead}~${encodeCursor(c.at, c.id)}~${backlogId}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE = /^\d{1,10}$/;

/**
 * The cursor, or null when it isn't one `encodeCollectionCursor` could have
 * emitted FOR THIS ORDER OF THIS COLLECTION: a cursor of another order is
 * refused too (its keys mean something else), so a client that switched
 * order mid-flight can't continue the old list into the new one; and one of
 * another collection would land at an arbitrary point of this one.
 */
export function decodeCollectionCursor(raw: unknown, sort: PagedSort, backlogId: string): CollectionCursor | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 240) return null;
  if (typeof backlogId !== "string" || backlogId.length === 0) return null;
  const parts = raw.split("~");
  if (parts.length !== 4 || parts[0] !== sort || parts[3] !== backlogId) return null;

  const spec = CURSOR_LEAD[sort];
  const cells = parts[1] === "" ? [] : parts[1].split(",");
  if (cells.length !== spec.length) return null;
  const lead: (number | null)[] = [];
  for (let i = 0; i < spec.length; i++) {
    const cell = cells[i];
    if (cell === "-") {
      if (!spec[i].nullable) return null;
      lead.push(null);
      continue;
    }
    if (!INT_RE.test(cell)) return null;
    const n = Number(cell);
    // `String(n) === cell` refuses "007": only what the encoder writes.
    if (String(n) !== cell || n < spec[i].min || n > spec[i].max) return null;
    lead.push(n);
  }

  const tail = decodeCursor(parts[2]);
  if (!tail || !UUID_RE.test(tail.id)) return null;
  return { sort, lead, at: tail.at, id: tail.id };
}

/**
 * The order as a comparator over rows (< 0 = `a` reads first) — the JS twin
 * of the SQL ORDER BY. Instants compare at MILLISECOND precision, like the
 * SQL side (`date_trunc('milliseconds', …)`): a JS Date carries no more.
 * The test uses it to prove "the rows after a cursor" are exactly the rest
 * of the list; the client uses it nowhere (the server's order is the order).
 */
export function compareRows(sort: PagedSort, a: CursorRow, b: CursorRow): number {
  const ca = cursorOf(sort, a);
  const cb = cursorOf(sort, b);
  let lead = 0;
  for (const name of CURSOR_ORDER[sort]) {
    if (name === "at") {
      // Newest first.
      const dt = cb.at.getTime() - ca.at.getTime();
      if (dt !== 0) return dt;
      continue;
    }
    if (name === "id") {
      if (ca.id !== cb.id) return ca.id < cb.id ? 1 : -1;
      continue;
    }
    const x = ca.lead[lead];
    const y = cb.lead[lead];
    lead++;
    if (x === y) continue;
    // position: nulls FIRST, ascending · rank: ascending · year: nulls LAST, descending.
    if (name === "year") {
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    }
    if (x === null) return -1;
    if (y === null) return 1;
    return x - y;
  }
  return 0;
}

/** Strictly after the cursor in this order (what page N+1 may contain). */
export function isAfterCursor(c: CollectionCursor, row: CursorRow): boolean {
  const probe: CursorRow = {
    id: c.id,
    addedAt: c.at,
    position: null,
    year: null,
    obsessed: false,
    verdict: null,
    status: "",
  };
  // Rebuild a row that yields the cursor's own keys, then compare as rows.
  CURSOR_LEAD[c.sort].forEach((k, i) => {
    const v = c.lead[i];
    if (k.name === "position") probe.position = v;
    else if (k.name === "year") probe.year = v;
    else {
      probe.obsessed = v === 0;
      probe.verdict = v === 1 ? "liked" : null;
      probe.status = v === 2 ? "completed" : "";
    }
  });
  return compareRows(c.sort, probe, row) < 0;
}
