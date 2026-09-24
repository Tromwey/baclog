import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import type { SeriesFactsPatch } from "./series-status";

/** ADR-007: re-fetch horizon ≤3 months (TMDB caps caching at 6). */
const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export type CatalogItemRow = typeof catalogItems.$inferSelect;

/**
 * Item reads serve from Postgres; staleness only matters for display
 * metadata, so we serve stale and let the next search upsert refresh it
 * (stale-while-revalidate at the catalog level — no blocking refetch).
 */
export async function getCatalogItem(
  id: string,
): Promise<(CatalogItemRow & { isStale: boolean }) | null> {
  const [row] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    isStale: Date.now() - row.refreshedAt.getTime() > STALE_MS,
  };
}

/**
 * F3.8 — persist the release date the item view just learned from iTunes.
 * Self-healing cache write, same posture as the cover palette: shared,
 * provider-derived, no user data, so it needs no ownership check.
 *
 * Writes ONLY on an actual change, which makes the common case (a released
 * album whose date we already have) a pure read. A moved date DOES overwrite —
 * label delays are normal, and a countdown to a date the store no longer
 * believes in is worse than no countdown. A null incoming value never erases a
 * known date: a failed lookup shouldn't retract a fact.
 *
 * The equality check stays exact OFF UTC too, which is not obvious: the column
 * is `timestamp` without a zone, yet the Neon/pg driver serializes and parses
 * it as UTC in BOTH directions. Verified from a UTC-6 machine — iTunes'
 * 07:00:00Z stored as wall 07:00:00 and read back as 07:00:00.000Z. So this
 * never degrades into an UPDATE per render, and local countdowns aren't
 * offset. Don't "fix" it into timestamptz on a hunch; measure first.
 */
export async function cacheReleaseDate(
  catalogItemId: string,
  incoming: Date | null,
  current: Date | null,
): Promise<void> {
  if (!incoming) return;
  if (current && current.getTime() === incoming.getTime()) return;
  try {
    await db
      .update(catalogItems)
      .set({ releaseDate: incoming })
      .where(eq(catalogItems.id, catalogItemId));
  } catch (err) {
    // A cache write must never take the page down with it.
    console.error("[catalog] release date cache failed:", err);
  }
}

/**
 * Series status (Revamp UI 06c/06d) — merge the TMDB `/tv/{id}` facts INTO
 * `catalog_item.raw` (jsonb `||`: existing search-hit keys survive, the four
 * fact keys + our `_series_facts_at` marker are added/overwritten). No new
 * column on purpose: migrations on the shared DB need the founder. Same
 * posture as `cacheReleaseDate`: shared, provider-derived, no user data, so
 * an anonymous public-page view may trigger it but can't influence what's
 * stored. `refreshed_at` is bumped too (the row IS fresher), but staleness of
 * THESE facts is read off the marker, not the column — the search upsert bumps
 * `refreshed_at` without touching `raw`.
 */
export async function cacheSeriesFacts(
  catalogItemId: string,
  patch: SeriesFactsPatch,
): Promise<void> {
  try {
    await db
      .update(catalogItems)
      .set({
        raw: sql`coalesce(${catalogItems.raw}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        refreshedAt: sql`now()`,
      })
      .where(eq(catalogItems.id, catalogItemId));
  } catch (err) {
    // A cache write must never take the page down with it.
    console.error("[catalog] series facts cache failed:", err);
  }
}

/**
 * API v1 `GET /titles?ids=` — the cached rows for a set of ids, in ONE query.
 * Unknown ids are simply absent (the caller decides whether that matters);
 * an empty list never hits the DB. Order is not guaranteed — callers that
 * care re-sort by the ids they asked for. Shared catalog facts only: no user
 * data lives on `catalog_item`, so no ownership check applies.
 */
export async function getCatalogItems(ids: string[]): Promise<CatalogItemRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(catalogItems).where(inArray(catalogItems.id, ids));
}

/**
 * API v1 membership `PUT` / onboarding picks — the "not cached yet" branch:
 * a search hit the app kept as `externalRef {source, externalId}` (the unique
 * `(source, external_id)` pair every provider upsert keys on). Null when the
 * provider row never reached the catalog; the caller answers 404 and asks
 * for a fresh search — this module never calls a provider. Shared catalog
 * facts only, no ownership check.
 */
export async function findCatalogItemByRef(
  source: "tmdb" | "itunes",
  externalId: string,
): Promise<CatalogItemRow | null> {
  const [row] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.source, source), eq(catalogItems.externalId, externalId)))
    .limit(1);
  return row ?? null;
}
