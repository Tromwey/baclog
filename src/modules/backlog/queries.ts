import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems } from "@/db/schema";

/**
 * All reads here are scoped by userId in the query itself — callers pass
 * the session user id obtained from requireUser()/assertUser(). Public
 * (unauthenticated) reads live in public.ts, gated on isPublic (G6).
 */

export async function getBacklogsForUser(userId: string) {
  const rows = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      createdAt: backlogs.createdAt,
      itemCount: sql<number>`count(${backlogItems.id})::int`,
    })
    .from(backlogs)
    .leftJoin(backlogItems, eq(backlogItems.backlogId, backlogs.id))
    .where(eq(backlogs.userId, userId))
    .groupBy(backlogs.id)
    .orderBy(desc(backlogs.createdAt));

  if (rows.length === 0) return [];

  // Up to 4 cover posters per backlog, newest first
  const covers = await db
    .select({
      backlogId: backlogItems.backlogId,
      posterUrl: catalogItems.posterUrl,
      addedAt: backlogItems.addedAt,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(
      inArray(
        backlogItems.backlogId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(desc(backlogItems.addedAt));

  const coverMap = new Map<string, string[]>();
  for (const c of covers) {
    if (!c.posterUrl) continue;
    const list = coverMap.get(c.backlogId) ?? [];
    if (list.length < 4) {
      list.push(c.posterUrl);
      coverMap.set(c.backlogId, list);
    }
  }

  return rows.map((r) => ({ ...r, coverUrls: coverMap.get(r.id) ?? [] }));
}

export type BacklogItemWithCatalog = Awaited<
  ReturnType<typeof getBacklogItems>
>[number];

/** Caller must have verified ownership (assertOwnsBacklog) first. */
export async function getBacklogItems(backlogId: string) {
  return db
    .select({
      id: backlogItems.id,
      status: backlogItems.status,
      customStatusLabel: backlogItems.customStatusLabel,
      rating: backlogItems.rating,
      paletteHex: backlogItems.paletteHex,
      addedAt: backlogItems.addedAt,
      statusChangedAt: backlogItems.statusChangedAt,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      genre: catalogItems.genre,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(eq(backlogItems.backlogId, backlogId))
    .orderBy(desc(backlogItems.addedAt));
}
