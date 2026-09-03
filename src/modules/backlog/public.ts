import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  userFollows,
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
  // F3.11 — the photo URL is identity, shown wherever the handle is.
  image: users.image,
};

export async function getPublicProfile(username: string) {
  const [user] = await db
    .select(publicUser)
    .from(users)
    .where(and(eq(users.username, username), eq(users.isPublic, true)))
    .limit(1);
  if (!user) return null;

  // F3.10.1 — the profile lists only the ESCAPARATE: public AND chosen for
  // the profile. A public-but-unfeatured backlog stays reachable by direct
  // link (getPublicBacklog below); a private one exists nowhere out here.
  const lists = await db
    .select({
      id: backlogs.id,
      name: backlogs.name,
      vibe: backlogs.vibe,
      itemCount: sql<number>`count(${backlogItems.id})::int`,
    })
    .from(backlogs)
    .leftJoin(backlogItems, eq(backlogItems.backlogId, backlogs.id))
    .where(
      and(
        eq(backlogs.userId, user.id),
        eq(backlogs.isPublic, true),
        eq(backlogs.showOnProfile, true),
      ),
    )
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
  // Revamp UI (screen 10): the row's fan of up to three covers, newest first,
  // keeping a coverless title so the fan can paint its palette instead of
  // skipping a slot (posterUrl OR paletteHex — never both missing).
  const fans = new Map<string, { posterUrl: string | null; paletteHex: string[] | null }[]>();
  for (const c of coverRows) {
    if (c.posterUrl) {
      const list = covers.get(c.backlogId) ?? [];
      if (list.length < 4) {
        list.push(c.posterUrl);
        covers.set(c.backlogId, list);
      }
    }
    if (c.posterUrl || c.paletteHex?.length) {
      const fan = fans.get(c.backlogId) ?? [];
      if (fan.length < 3) {
        fan.push({ posterUrl: c.posterUrl, paletteHex: c.paletteHex ?? null });
        fans.set(c.backlogId, fan);
      }
    }
  }
  // Per-backlog ADN (each shelf's aura) + the owner aggregate (hero aura).
  const backlogPalettes = groupDominantHexes(coverRows, (c) => c.backlogId, 6);
  const palette = dominantHexes(coverRows, 6);

  // F3.8 — what this profile is waiting for. Same definition as the in-app
  // strip (library.ts getLibraryUpcoming): scoped to user_item, so a title
  // filed in two backlogs appears once, and to dates still in the future.
  //
  // Every field it returns is catalog data, which is what keeps this inside the
  // public-safe field list this function is built around: nothing here says
  // WHICH backlog a title is in, or anything about the owner's state on it.
  // Spelled out here rather than shared so a column added to the in-app select
  // can never become public just because it rode along.
  const upcoming = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .where(and(eq(userItems.userId, user.id), gt(catalogItems.releaseDate, new Date())))
    .orderBy(asc(catalogItems.releaseDate))
    .limit(12);

  // F3.10 — follower count is PUBLIC by decision (counts public, lists
  // private): an aggregate over follow edges, nothing identifying anyone.
  const [followerAgg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userFollows)
    .where(eq(userFollows.followedUserId, user.id));

  return {
    displayName: user.name ?? user.username ?? "",
    username: user.username!,
    isFounder: user.isFounder,
    avatarUrl: user.image,
    followerCount: followerAgg?.n ?? 0,
    // Lima fallback so an owner with no extracted palette still auras.
    palette: palette.length > 0 ? palette : ["#D8FF3E"],
    backlogs: lists.map((l) => ({
      ...l,
      coverUrls: covers.get(l.id) ?? [],
      covers: fans.get(l.id) ?? [],
      paletteHex: backlogPalettes.get(l.id) ?? ["#D8FF3E"],
    })),
    upcoming: upcoming.map((u) => ({
      catalogItemId: u.catalogItemId,
      title: u.title,
      mediaType: u.mediaType,
      posterUrl: u.posterUrl,
      paletteHex: u.paletteHex ?? null,
      releaseDate: u.releaseDate!.toISOString(),
    })),
  };
}

/**
 * Revamp UI (screen 10) — the three stat pills on a public profile: how many
 * titles the owner liked, obsesses over and completed. Their OWN aggregates
 * over user_item (no other account is involved), public-safe by construction
 * — three counts, no title, no backlog — and gated exactly like the profile:
 * a private or nonexistent handle gets null, identically.
 */
export async function getPublicReactionCounts(username: string) {
  const [row] = await db
    .select({
      liked: sql<number>`(count(${userItems.id}) filter (where ${userItems.verdict} = 'liked'))::int`,
      obsessed: sql<number>`(count(${userItems.id}) filter (where ${userItems.obsessed}))::int`,
      completed: sql<number>`(count(${userItems.id}) filter (where ${userItems.status} = 'completed'))::int`,
    })
    .from(users)
    .leftJoin(userItems, eq(userItems.userId, users.id))
    .where(and(eq(users.username, username), eq(users.isPublic, true)))
    .groupBy(users.id)
    .limit(1);
  if (!row) return null;
  return { liked: row.liked, obsessed: row.obsessed, completed: row.completed };
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
        // F3.10.1 — a private backlog 404s identically to a nonexistent one,
        // whatever the owner's account visibility says.
        eq(backlogs.isPublic, true),
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
      // F3.8 — the countdown replaces the year on a public row too: the wait
      // is catalog data, identical for any visitor, session or not.
      releaseDate: catalogItems.releaseDate,
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
