import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  userFollows,
  userItems,
  users,
} from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { publicAuthor } from "./queries";

/**
 * Viewer ↔ profile affinity (Revamp UI screen 10, 2026-09-03): the line under
 * the follow button ("Siguen a @x y 3 más · 4 títulos en común") and the "En
 * común contigo" strip.
 *
 * Runs WITH a session (the viewer) but reads the PROFILE owner's rows, so it
 * follows the social module's rules (AGENTS.md F3.10): the profile is
 * resolved by handle under `publicAuthor` inside the query, the shared
 * follows are only named when they are public themselves, and — the part
 * that matters most — the titles in common are counted and listed ONLY where
 * the profile owner keeps them in a PUBLIC backlog (`backlog.is_public`).
 * The count and the strip come from the same gated set on purpose: a count
 * that included private shelves would let a viewer add a title and watch the
 * number tick, which is an oracle on a private backlog. The viewer's own side
 * needs no gate (it's their own library). Never accepts a user id from the
 * client: `viewerId` is the session's.
 */

export interface CommonTitle {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

export interface Affinity {
  /** Public accounts BOTH follow: the first handle to name and the rest. */
  shared: { firstUsername: string; more: number } | null;
  /** Distinct titles in common, gated on the owner's public backlogs. */
  commonTitles: number;
  /** Up to 8 of those, most recently shelved by the owner first. */
  common: CommonTitle[];
}

export async function getAffinity(
  viewerId: string,
  username: string,
): Promise<Affinity | null> {
  const [profile] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), publicAuthor, ne(users.id, viewerId)))
    .limit(1);
  if (!profile) return null;
  const profileId = profile.id;

  const theirs = alias(userFollows, "their_follow");
  const inPublicBacklog = and(
    eq(userItems.userId, viewerId),
    sql`exists (
      select 1 from ${backlogItems} bi
      join ${backlogs} b on b.id = bi.backlog_id
      where bi.user_id = ${profileId}
        and bi.catalog_item_id = ${userItems.catalogItemId}
        and b.is_public = true
    )`,
  );

  // When the owner last shelved the title publicly — the strip's order.
  const shelvedAt = sql<string>`(
    select max(bi.added_at) from ${backlogItems} bi
    join ${backlogs} b on b.id = bi.backlog_id
    where bi.user_id = ${profileId}
      and bi.catalog_item_id = ${catalogItems.id}
      and b.is_public = true
  )`;

  const [sharedRows, [countRow], commonRows] = await Promise.all([
    // Accounts the viewer follows that the profile also follows — named only
    // when public (a private account is an anonymous count, never a handle).
    db
      .select({ username: users.username })
      .from(userFollows)
      .innerJoin(
        theirs,
        and(
          eq(theirs.followerUserId, profileId),
          eq(theirs.followedUserId, userFollows.followedUserId),
        ),
      )
      .innerJoin(users, and(eq(users.id, userFollows.followedUserId), publicAuthor))
      .where(eq(userFollows.followerUserId, viewerId))
      .orderBy(desc(userFollows.createdAt)),
    db
      .select({ n: sql<number>`count(distinct ${userItems.catalogItemId})::int` })
      .from(userItems)
      .where(inPublicBacklog),
    db
      .select({
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
      })
      .from(userItems)
      .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
      .where(inPublicBacklog)
      .orderBy(desc(shelvedAt))
      .limit(8),
  ]);

  const handles = sharedRows
    .map((r) => r.username)
    .filter((u): u is string => Boolean(u));

  return {
    shared:
      handles.length > 0
        ? { firstUsername: handles[0], more: handles.length - 1 }
        : null,
    commonTitles: countRow?.n ?? 0,
    common: commonRows,
  };
}
