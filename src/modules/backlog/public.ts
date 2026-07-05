import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { backlogItems, backlogs, catalogItems, users } from "@/db/schema";

/**
 * THE deliberate authz exception (see src/authz): these queries run with
 * no session, for anonymous viewers. Every function gates on
 * users.isPublic = true INSIDE the query and selects an explicit public
 * field list — never email, birthYear, or preferredService. A private or
 * nonexistent username returns null identically (no enumeration oracle).
 */

const publicUser = {
  id: users.id,
  name: users.name,
  username: users.username,
  isFounder: users.isFounder,
};

export async function getPublicProfile(username: string) {
  const [user] = await db
    .select(publicUser)
    .from(users)
    .where(and(eq(users.username, username), eq(users.isPublic, true)))
    .limit(1);
  if (!user) return null;

  const lists = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      itemCount: sql<number>`count(${backlogItems.id})::int`,
    })
    .from(backlogs)
    .leftJoin(backlogItems, eq(backlogItems.backlogId, backlogs.id))
    .where(eq(backlogs.userId, user.id))
    .groupBy(backlogs.id)
    .orderBy(desc(backlogs.createdAt));

  const coverRows =
    lists.length > 0
      ? await db
          .select({
            backlogId: backlogItems.backlogId,
            posterUrl: catalogItems.posterUrl,
          })
          .from(backlogItems)
          .innerJoin(
            catalogItems,
            eq(backlogItems.catalogItemId, catalogItems.id),
          )
          .where(
            inArray(
              backlogItems.backlogId,
              lists.map((l) => l.id),
            ),
          )
          .orderBy(desc(backlogItems.addedAt))
      : [];

  const covers = new Map<string, string[]>();
  for (const c of coverRows) {
    if (!c.posterUrl) continue;
    const list = covers.get(c.backlogId) ?? [];
    if (list.length < 4) {
      list.push(c.posterUrl);
      covers.set(c.backlogId, list);
    }
  }

  return {
    displayName: user.name ?? user.username ?? "",
    username: user.username!,
    isFounder: user.isFounder,
    backlogs: lists.map((l) => ({
      ...l,
      coverUrls: covers.get(l.id) ?? [],
    })),
  };
}

export async function getPublicBacklog(username: string, backlogId: string) {
  const [row] = await db
    .select({
      backlogId: backlogs.id,
      backlogName: backlogs.name,
      vibe: backlogs.vibe,
      ownerName: users.name,
      ownerUsername: users.username,
    })
    .from(backlogs)
    .innerJoin(users, eq(backlogs.userId, users.id))
    .where(
      and(
        eq(backlogs.id, backlogId),
        eq(users.username, username),
        eq(users.isPublic, true),
      ),
    )
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({
      id: backlogItems.id,
      status: backlogItems.status,
      customStatusLabel: backlogItems.customStatusLabel,
      rating: backlogItems.rating,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
    })
    .from(backlogItems)
    .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
    .where(eq(backlogItems.backlogId, row.backlogId))
    .orderBy(desc(backlogItems.addedAt));

  return { ...row, items };
}

/** Item info for the public per-item page (shared catalog, not user data). */
export async function getPublicCatalogItem(catalogItemId: string) {
  const [item] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, catalogItemId))
    .limit(1);
  return item ?? null;
}
