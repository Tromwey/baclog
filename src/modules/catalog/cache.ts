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
