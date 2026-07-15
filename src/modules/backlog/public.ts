import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  userItems,
  users,
} from "@/db/schema";
import { dominantHexes, groupDominantHexes } from "./palette";

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
            paletteHex: catalogItems.paletteHex,
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
    if (c.posterUrl) {
      const list = covers.get(c.backlogId) ?? [];
      if (list.length < 4) {
        list.push(c.posterUrl);
        covers.set(c.backlogId, list);
      }
    }
  }
  // Per-backlog ADN (each shelf's aura) + the owner aggregate (hero aura).
  const backlogPalettes = groupDominantHexes(coverRows, (c) => c.backlogId, 6);
  const palette = dominantHexes(coverRows, 6);

  return {
    displayName: user.name ?? user.username ?? "",
    username: user.username!,
    isFounder: user.isFounder,
    // Lima fallback so an owner with no extracted palette still auras.
    palette: palette.length > 0 ? palette : ["#D8FF3E"],
    backlogs: lists.map((l) => ({
      ...l,
      coverUrls: covers.get(l.id) ?? [],
      paletteHex: backlogPalettes.get(l.id) ?? ["#D8FF3E"],
    })),
  };
}

export async function getPublicBacklog(username: string, backlogId: string) {
  const [row] = await db
    .select({
      backlogId: backlogs.id,
      backlogName: backlogs.name,
      vibe: backlogs.vibe,
      // Creation year for the hero meta ("{N} ítems · {año}"). Public-safe: the
      // backlog itself is already public; a year is not user-identifying.
      createdAt: backlogs.createdAt,
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
      status: userItems.status,
      // F3.7 — two independent axes with different public rules (handoff §1):
      // `obsessed` IS the public real-time "obsessing over" signal, so it always
      // shows. A `verdict` (me gusta / no me gusta) is a SETTLED judgement, only
      // exposed once the item is completed — a mid-consumption verdict is a live
      // behavioral signal. Both gated at the query layer, not display. State is
      // per-title (user_item), so it reads identically across the owner's shelves.
      obsessed: userItems.obsessed,
      verdict: sql<
        string | null
      >`case when ${userItems.status} = 'completed' then ${userItems.verdict} else null end`,
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      year: catalogItems.year,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      // Cover-art colors only (nothing user-identifying) — feeds the backlog's
      // ADN aura on the public page via dominantHexes below. Shared catalog row.
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
    .where(eq(backlogItems.backlogId, row.backlogId))
    .orderBy(desc(backlogItems.addedAt));

  // Rows are newest-first, matching the in-app aura's aggregation order.
  return { ...row, items, palette: dominantHexes(items, 6) };
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
