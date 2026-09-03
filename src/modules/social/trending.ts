import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  itemReviews,
  userItems,
  users,
} from "@/db/schema";
import type { MediaType } from "@/modules/catalog/types";
import { avatarHexesFor } from "@/modules/reviews/queries";
import { FALLBACK_ADN, WEEK } from "@/modules/reviews/format";
import { getFollowedIds, publicAuthor } from "./queries";

/**
 * Revamp UI (2026-09-03) — "Entre quienes sigues · Esta semana": the titles
 * the people you follow touched most in the last 7 days, ranked by how many
 * DISTINCT followed people did something with each (added, completed,
 * obsessed, reviewed — the feed's four sources, same gates).
 *
 * A cross-user read, so it follows social/queries.ts to the letter: every
 * branch re-gates `publicAuthor` (isPublic + username) INSIDE the query, the
 * adds branch additionally requires `backlogs.isPublic` (F3.10.1 — an add to
 * a private backlog is nobody's business), reviews skip hidden ones, and the
 * field list is the public-safe one (username, avatar pointer, catalog
 * metadata). A followed account that went private simply stops counting.
 */

export interface TrendingPerson {
  username: string;
  avatarHexes: [string, string];
  avatarUrl: string | null;
}

export interface TrendingTitle {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  paletteHex: string[];
  /** Distinct followed people behind this title this week. */
  count: number;
  /** Up to three of them, most recent activity first. */
  people: TrendingPerson[];
}

/** Rows a single branch may contribute — a ceiling, not a page. */
const BRANCH_CAP = 400;

interface Touch {
  catalogItemId: string;
  userId: string;
  username: string | null;
  image: string | null;
  at: Date | null;
}

export async function getTrendingAmongFollowed(
  userId: string,
  now: Date,
  limit = 3,
): Promise<TrendingTitle[]> {
  const ids = await getFollowedIds(userId);
  if (ids.length === 0) return [];
  const since = new Date(now.getTime() - WEEK);

  const person = { username: users.username, image: users.image };

  const [adds, completions, obsessions, reviews] = await Promise.all([
    db
      .select({
        catalogItemId: backlogItems.catalogItemId,
        userId: backlogItems.userId,
        at: backlogItems.addedAt,
        ...person,
      })
      .from(backlogItems)
      .innerJoin(users, and(eq(users.id, backlogItems.userId), publicAuthor))
      .innerJoin(
        backlogs,
        and(eq(backlogs.id, backlogItems.backlogId), eq(backlogs.isPublic, true)),
      )
      .where(
        and(
          inArray(backlogItems.userId, ids),
          gte(backlogItems.addedAt, since),
        ),
      )
      .limit(BRANCH_CAP),
    db
      .select({
        catalogItemId: userItems.catalogItemId,
        userId: userItems.userId,
        at: userItems.statusChangedAt,
        ...person,
      })
      .from(userItems)
      .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
      .where(
        and(
          inArray(userItems.userId, ids),
          eq(userItems.status, "completed"),
          gte(userItems.statusChangedAt, since),
        ),
      )
      .limit(BRANCH_CAP),
    db
      .select({
        catalogItemId: userItems.catalogItemId,
        userId: userItems.userId,
        at: userItems.obsessedAt,
        ...person,
      })
      .from(userItems)
      .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
      .where(
        and(
          inArray(userItems.userId, ids),
          eq(userItems.obsessed, true),
          isNotNull(userItems.obsessedAt),
          gte(userItems.obsessedAt, since),
        ),
      )
      .limit(BRANCH_CAP),
    db
      .select({
        catalogItemId: itemReviews.catalogItemId,
        userId: itemReviews.userId,
        at: itemReviews.createdAt,
        ...person,
      })
      .from(itemReviews)
      .innerJoin(users, and(eq(users.id, itemReviews.userId), publicAuthor))
      .where(
        and(
          inArray(itemReviews.userId, ids),
          isNull(itemReviews.hiddenAt),
          gte(itemReviews.createdAt, since),
        ),
      )
      .limit(BRANCH_CAP),
  ]);

  // Per title: the distinct people, each remembered at their LATEST touch.
  const byTitle = new Map<string, Map<string, Touch>>();
  for (const t of [...adds, ...completions, ...obsessions, ...reviews] as Touch[]) {
    if (!t.username) continue; // publicAuthor already guarantees it; belt and braces
    const people = byTitle.get(t.catalogItemId) ?? new Map<string, Touch>();
    const prev = people.get(t.userId);
    if (!prev || (t.at && (!prev.at || t.at > prev.at))) people.set(t.userId, t);
    byTitle.set(t.catalogItemId, people);
  }
  if (byTitle.size === 0) return [];

  const ranked = [...byTitle.entries()]
    .map(([catalogItemId, people]) => {
      const touches = [...people.values()].sort(
        (a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0),
      );
      return { catalogItemId, touches, latest: touches[0]?.at?.getTime() ?? 0 };
    })
    .sort((a, b) => b.touches.length - a.touches.length || b.latest - a.latest)
    .slice(0, limit);

  const titleIds = ranked.map((r) => r.catalogItemId);
  const personIds = [
    ...new Set(ranked.flatMap((r) => r.touches.slice(0, 3).map((t) => t.userId))),
  ];
  const [titles, hexes] = await Promise.all([
    db
      .select({
        id: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        byline: catalogItems.byline,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
      })
      .from(catalogItems)
      .where(inArray(catalogItems.id, titleIds)),
    avatarHexesFor(personIds),
  ]);
  const titleMap = new Map(titles.map((t) => [t.id, t]));

  const out: TrendingTitle[] = [];
  for (const r of ranked) {
    const t = titleMap.get(r.catalogItemId);
    if (!t) continue;
    out.push({
      catalogItemId: t.id,
      title: t.title,
      mediaType: t.mediaType,
      year: t.year,
      byline: t.byline,
      posterUrl: t.posterUrl,
      paletteHex: t.paletteHex ?? [],
      count: r.touches.length,
      people: r.touches.slice(0, 3).map((p) => ({
        username: p.username as string,
        avatarHexes: hexes.get(p.userId) ?? FALLBACK_ADN,
        avatarUrl: p.image,
      })),
    });
  }
  return out;
}
