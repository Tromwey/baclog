import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";

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
