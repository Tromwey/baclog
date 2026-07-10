import "server-only";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, userItems } from "@/db/schema";
import type { MediaType } from "@/modules/cards/types";

/**
 * Lentes inteligentes (HANDOFF §4): auto-generated FILTERS over the user's
 * whole library — not shelves. Never count them as backlogs or sum their
 * items into a total (an item lives in one manual shelf AND several lenses).
 *
 * Reads are scoped by userId in the query itself — callers pass the session
 * user id from requireUser()/assertUser() (same trust model as queries.ts).
 */

export type LensKind = "obsessed" | "in_progress" | "completed" | "on_my_radar";

export interface LensItem {
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  verdict: "disliked" | "liked" | null;
  obsessed: boolean;
  sourceCrossMediaRecId: string | null;
  paletteHex: string[] | null;
}

/** One "De {estante}" section of a lens view (items grouped by home shelf). */
export interface LensGroup {
  backlogId: string;
  backlogName: string;
  items: LensItem[];
}

/**
 * The user's library filtered through a lens, grouped by shelf of origin
 * ("De Julio '26", "De Sci-fi que duele"…). The `obsessed` lens filters on
 * reaction (obsession is status-independent, HANDOFF §1); the other three
 * filter on progress status. Groups follow backlog recency (newest shelf
 * first), items within a group follow addedAt desc — one query, reduced in
 * first-encounter order.
 */
export async function getLensItems(
  userId: string,
  kind: LensKind,
): Promise<LensGroup[]> {
  // State (obsessed/status) is per-title (user_item); a title in two shelves
  // legitimately appears under both "De X" groups (membership is per-backlog).
  const filter =
    kind === "obsessed"
      ? eq(userItems.obsessed, true)
      : eq(userItems.status, kind);

  const rows = await db
    .select({
      backlogId: backlogs.id,
      backlogName: backlogs.name,
      backlogItemId: backlogItems.id,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      verdict: userItems.verdict,
      obsessed: userItems.obsessed,
      sourceCrossMediaRecId: userItems.sourceCrossMediaRecId,
      paletteHex: catalogItems.paletteHex,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .innerJoin(
      userItems,
      and(
        eq(userItems.userId, backlogItems.userId),
        eq(userItems.catalogItemId, backlogItems.catalogItemId),
      ),
    )
    .innerJoin(backlogs, eq(backlogItems.backlogId, backlogs.id))
    .where(and(eq(backlogItems.userId, userId), filter))
    .orderBy(desc(backlogs.createdAt), desc(backlogItems.addedAt));

  const byBacklog = new Map<string, LensGroup>();
  for (const { backlogId, backlogName, ...item } of rows) {
    let group = byBacklog.get(backlogId);
    if (!group) {
      group = { backlogId, backlogName, items: [] };
      byBacklog.set(backlogId, group);
    }
    group.items.push(item);
  }
  return [...byBacklog.values()];
}
