import "server-only";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import {
  backlogItems,
  backlogs,
  catalogItems,
  itemReviews,
  userFollows,
  userItems,
  users,
} from "@/db/schema";
import { MEDIA_TYPE_TITLE } from "@/modules/catalog/types";
import { formatCountdown, isUpcoming } from "@/modules/catalog/release";
import {
  avatarHexesFor,
  decodeCursor,
  initialOf,
  markOf,
} from "@/modules/reviews/queries";
import { FALLBACK_ADN, relativeWhen } from "@/modules/reviews/format";
import {
  FEED_PAGE_SIZE,
  PEOPLE_PAGE_SIZE,
  type FeedEvent,
  type FeedEventKind,
  type FeedPage,
  type SuggestedProfile,
  type PeoplePage,
  type PersonRow,
} from "./types";

/**
 * F3.10 — reads for the social feed and the follow graph.
 *
 * Every read here runs WITH a session (the feed is an authenticated surface;
 * assertUser/requireUser happens at the caller), but they read OTHER users'
 * rows — so they follow the public.ts / reviews-feed rules anyway: every
 * cross-user query gates on `publicAuthor` (isPublic + username) INSIDE the
 * query and selects an explicit public-safe field list. That gate is what
 * makes a follow row inert the moment its target goes private: the
 * feed/suggestions simply stop returning them, with nothing to clean up.
 *
 * THE FEED IS DERIVED, NOT STORED. Four branch queries (adds, completions,
 * obsessions, reviews) over the followed ids, each keyset-paginated on
 * (at, eventId), merged in process. No fan-out table: at the current scale the
 * indexed per-user scans are cheap, and the derived read is the source of
 * truth a future materialization would have to agree with anyway.
 */

/**
 * The one followable/showable predicate, shared with the follow mutation
 * (social-actions.ts) so "who can be followed" and "whose activity shows"
 * can never drift apart.
 */
export const publicAuthor = and(
  eq(users.isPublic, true),
  isNotNull(users.username),
);

// ---------- follow graph ----------

export async function getFollowedIds(viewerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: userFollows.followedUserId })
    .from(userFollows)
    .where(eq(userFollows.followerUserId, viewerId));
  return rows.map((r) => r.id);
}

export async function getFollowCounts(viewerId: string) {
  const [[following], [followers]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(eq(userFollows.followerUserId, viewerId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(eq(userFollows.followedUserId, viewerId)),
  ]);
  return { following: following?.n ?? 0, followers: followers?.n ?? 0 };
}

/** Whether the viewer follows the profile at `username` (any visibility). */
export async function isFollowing(
  viewerId: string,
  username: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userFollows.id })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followedUserId))
    .where(
      and(
        eq(userFollows.followerUserId, viewerId),
        eq(users.username, username),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ---------- the feed ----------

/**
 * Branch keyset: strictly older, or same instant with a smaller composite id.
 *
 * `date_trunc('milliseconds', …)` on the SQL side is load-bearing: Postgres
 * stores microseconds but a JS Date (and therefore the cursor) only carries
 * milliseconds, so a naive `eq(atCol, cursor)` NEVER matches and events
 * sharing the boundary millisecond get silently skipped between pages
 * (verified against real rows — added_at like `…58.613356`). Truncating both
 * sides to the same precision makes encode/decode true inverses; the
 * composite-id tiebreak then covers everything inside the shared millisecond.
 */
function olderThan(
  atCol: AnyColumn,
  idExpr: SQL,
  after: { at: Date; id: string } | null,
) {
  if (!after) return undefined;
  return sql`(date_trunc('milliseconds', ${atCol}) < ${after.at} or (date_trunc('milliseconds', ${atCol}) = ${after.at} and ${idExpr} < ${after.id}))`;
}

interface RawEvent {
  kind: FeedEventKind;
  rowId: string;
  at: Date;
  userId: string;
  username: string | null;
  catalogItemId: string;
  title: string;
  mediaType: (typeof catalogItems.$inferSelect)["mediaType"];
  year: number | null;
  byline: string | null;
  posterUrl: string | null;
  releaseDate: Date | null;
  backlogName: string | null;
  verdict: string | null;
  obsessed: boolean;
  body: string | null;
  hasSpoiler: boolean;
}

/**
 * The mono-meta wait string for a feed card. Days/hours phases are stable
 * enough to serialize; the LIVE phase (a per-second clock) must never be baked
 * into a static string — the release.ts header comment exists because of
 * exactly that bug — so inside the last day the card just says the honest,
 * stable thing.
 */
function waitingLabel(releaseDate: Date, now: number): string {
  const parts = formatCountdown(releaseDate, now);
  return parts.phase === "live" ? "sale hoy" : parts.phrase;
}

export async function getFeedPage(
  viewerId: string,
  opts: { cursor?: string | null; limit?: number; now?: number } = {},
): Promise<FeedPage> {
  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const now = opts.now ?? Date.now();
  const after = decodeCursor(opts.cursor ?? null);

  const ids = await getFollowedIds(viewerId);
  if (ids.length === 0)
    return { events: [], nextCursor: null, followingCount: 0 };

  // Each branch over-fetches a full page so the merge can be dominated by any
  // single kind and still fill up; limit+1 total is how hasMore is known.
  const fetch = limit + 1;

  const [adds, completions, obsessions, reviews] = await Promise.all([
    // "Agregó {título} a {backlog}" — per MEMBERSHIP add, so filing a title
    // into a second backlog is (correctly) new activity, with the shelf named.
    db
      .select({
        rowId: backlogItems.id,
        at: backlogItems.addedAt,
        userId: backlogItems.userId,
        username: users.username,
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        byline: catalogItems.byline,
        posterUrl: catalogItems.posterUrl,
        releaseDate: catalogItems.releaseDate,
        backlogName: backlogs.name,
      })
      .from(backlogItems)
      .innerJoin(
        users,
        and(eq(users.id, backlogItems.userId), publicAuthor),
      )
      // F3.10.1 — an add to a PRIVATE backlog is not activity anyone gets to
      // see: the whole event vanishes (not just the shelf name). Read-time
      // join, so making a backlog private retracts its adds from every feed
      // retroactively, and re-publishing restores them — derived, as always.
      .innerJoin(
        backlogs,
        and(
          eq(backlogs.id, backlogItems.backlogId),
          eq(backlogs.isPublic, true),
        ),
      )
      .innerJoin(catalogItems, eq(catalogItems.id, backlogItems.catalogItemId))
      .where(
        and(
          inArray(backlogItems.userId, ids),
          olderThan(
            backlogItems.addedAt,
            sql`'added:' || ${backlogItems.id}`,
            after,
          ),
        ),
      )
      .orderBy(desc(backlogItems.addedAt), desc(backlogItems.id))
      .limit(fetch),

    // "Completó {título}" — the only event that carries a verdict (F3.7's
    // public rule verbatim: a verdict only shows once the title is completed).
    db
      .select({
        rowId: userItems.id,
        at: userItems.statusChangedAt,
        userId: userItems.userId,
        username: users.username,
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        byline: catalogItems.byline,
        posterUrl: catalogItems.posterUrl,
        releaseDate: catalogItems.releaseDate,
        verdict: userItems.verdict,
      })
      .from(userItems)
      .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
      .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
      .where(
        and(
          inArray(userItems.userId, ids),
          eq(userItems.status, "completed"),
          olderThan(
            userItems.statusChangedAt,
            sql`'completed:' || ${userItems.id}`,
            after,
          ),
        ),
      )
      .orderBy(desc(userItems.statusChangedAt), desc(userItems.id))
      .limit(fetch),

    // "Le obsesiona {título}" — already the public real-time signal (F3.7).
    db
      .select({
        rowId: userItems.id,
        at: userItems.obsessedAt,
        userId: userItems.userId,
        username: users.username,
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        byline: catalogItems.byline,
        posterUrl: catalogItems.posterUrl,
        releaseDate: catalogItems.releaseDate,
      })
      .from(userItems)
      .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
      .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
      .where(
        and(
          inArray(userItems.userId, ids),
          eq(userItems.obsessed, true),
          isNotNull(userItems.obsessedAt),
          olderThan(
            userItems.obsessedAt,
            sql`'obsessed:' || ${userItems.id}`,
            after,
          ),
        ),
      )
      .orderBy(desc(userItems.obsessedAt), desc(userItems.id))
      .limit(fetch),

    // "Reseñó {título}" — the F3.9 card inside a feed card. Same moderation
    // gate as the reviews feed: a hidden review is out of here too.
    db
      .select({
        rowId: itemReviews.id,
        at: itemReviews.createdAt,
        userId: itemReviews.userId,
        username: users.username,
        catalogItemId: catalogItems.id,
        title: catalogItems.title,
        mediaType: catalogItems.mediaType,
        year: catalogItems.year,
        byline: catalogItems.byline,
        posterUrl: catalogItems.posterUrl,
        releaseDate: catalogItems.releaseDate,
        body: itemReviews.body,
        hasSpoiler: itemReviews.hasSpoiler,
        verdict: userItems.verdict,
        obsessed: userItems.obsessed,
      })
      .from(itemReviews)
      .innerJoin(users, and(eq(users.id, itemReviews.userId), publicAuthor))
      .innerJoin(catalogItems, eq(catalogItems.id, itemReviews.catalogItemId))
      .leftJoin(
        userItems,
        and(
          eq(userItems.userId, itemReviews.userId),
          eq(userItems.catalogItemId, itemReviews.catalogItemId),
        ),
      )
      .where(
        and(
          inArray(itemReviews.userId, ids),
          isNull(itemReviews.hiddenAt),
          olderThan(
            itemReviews.createdAt,
            sql`'reviewed:' || ${itemReviews.id}`,
            after,
          ),
        ),
      )
      .orderBy(desc(itemReviews.createdAt), desc(itemReviews.id))
      .limit(fetch),
  ]);

  const raw: RawEvent[] = [
    ...adds.map((r) => ({
      ...r,
      kind: "added" as const,
      verdict: null,
      obsessed: false,
      body: null,
      hasSpoiler: false,
    })),
    ...completions.map((r) => ({
      ...r,
      kind: "completed" as const,
      backlogName: null,
      obsessed: false,
      body: null,
      hasSpoiler: false,
    })),
    ...obsessions
      .filter((r) => r.at !== null)
      .map((r) => ({
        ...r,
        at: r.at!,
        kind: "obsessed" as const,
        backlogName: null,
        verdict: null,
        obsessed: true,
        body: null,
        hasSpoiler: false,
      })),
    ...reviews.map((r) => ({
      ...r,
      kind: "reviewed" as const,
      backlogName: null,
      obsessed: r.obsessed ?? false,
    })),
  ];

  const eventIdOf = (e: RawEvent) => `${e.kind}:${e.rowId}`;
  raw.sort((a, b) => {
    const d = b.at.getTime() - a.at.getTime();
    if (d !== 0) return d;
    return eventIdOf(a) < eventIdOf(b) ? 1 : -1;
  });

  const hasMore = raw.length > limit;
  const page = raw.slice(0, limit);
  const hexes = await avatarHexesFor([...new Set(page.map((r) => r.userId))]);

  const events: FeedEvent[] = page.map((r) => {
    const username = r.username ?? "";
    return {
      id: eventIdOf(r),
      kind: r.kind,
      when: relativeWhen(r.at, now),
      author: {
        username,
        initial: initialOf(username),
        avatarHexes: hexes.get(r.userId) ?? FALLBACK_ADN,
      },
      catalogItemId: r.catalogItemId,
      title: r.title,
      mediaType: r.mediaType,
      mediaTypeLabel: MEDIA_TYPE_TITLE[r.mediaType],
      year: r.year,
      byline: r.byline,
      posterUrl: r.posterUrl,
      waiting:
        r.kind === "added" && isUpcoming(r.releaseDate, now)
          ? waitingLabel(r.releaseDate!, now)
          : null,
      backlogName: r.backlogName,
      // The verdict travels only on Completó/Reseñó; the obsession EVENT
      // carries its flame on the verb line, not as a mark.
      mark:
        r.kind === "completed" || r.kind === "reviewed"
          ? markOf({
              obsessed: r.kind === "reviewed" ? r.obsessed : false,
              verdict: r.verdict,
            })
          : null,
      reviewBody: r.body,
      hasSpoiler: r.hasSpoiler,
    };
  });

  const last = page.at(-1);
  return {
    events,
    nextCursor:
      hasMore && last ? `${last.at.toISOString()}|${eventIdOf(last)}` : null,
    followingCount: ids.length,
  };
}

// ---------- suggestions (the empty states' onboarding) ----------

/** "hoy"/"ayer" by CALENDAR day (product home timezone), not a rolling 24 h
 *  window — at 09:00, activity from yesterday 20:00 is "ayer", not "hoy". */
const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function activityBucket(last: number, now: number): "hoy" | "ayer" | null {
  const day = DAY_KEY.format(last);
  if (day === DAY_KEY.format(now)) return "hoy";
  if (day === DAY_KEY.format(now - 86_400_000)) return "ayer";
  return null;
}

/**
 * Public profiles worth offering: not you, not already followed, most recently
 * active first (their newest library add), so "gente que sí está activa" is
 * literally the sort order. Everything selected is public-safe, and the batch
 * queries re-gate on `publicAuthor` themselves — the candidate set was gated
 * one query earlier, and a profile that flips private in between must not have
 * its covers or counts served anyway.
 */
export async function getFollowSuggestions(
  viewerId: string,
  limit = 5,
): Promise<SuggestedProfile[]> {
  const lastAt = sql<
    Date | string | null
  >`(select max(ui.added_at) from user_item ui where ui.user_id = ${users.id})`.as(
    "last_at",
  );

  const candidates = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      isFounder: users.isFounder,
      lastAt,
    })
    .from(users)
    .where(
      and(
        publicAuthor,
        ne(users.id, viewerId),
        sql`not exists (select 1 from ${userFollows} f where f.follower_user_id = ${viewerId} and f.followed_user_id = ${users.id})`,
      ),
    )
    .orderBy(sql`last_at desc nulls last`)
    .limit(limit);

  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);

  // Recent covers per candidate, POSTER-PREFERRED but ranked over the whole
  // library, so `total` is the real title count — the "+N" tail must not
  // shrink just because cover art is missing (it reads as library size).
  const ranked = db
    .select({
      userId: userItems.userId,
      posterUrl: catalogItems.posterUrl,
      mediaType: catalogItems.mediaType,
      rn: sql<number>`row_number() over (partition by ${userItems.userId} order by (${catalogItems.posterUrl} is not null) desc, ${userItems.addedAt} desc)`.as(
        "rn",
      ),
      total:
        sql<number>`(count(*) over (partition by ${userItems.userId}))::int`.as(
          "total",
        ),
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(userItems.catalogItemId, catalogItems.id))
    .innerJoin(users, and(eq(users.id, userItems.userId), publicAuthor))
    .where(inArray(userItems.userId, ids))
    .as("ranked");

  const [hexes, backlogCounts, followerCounts, coverRows] = await Promise.all([
    avatarHexesFor(ids),
    db
      .select({
        userId: backlogs.userId,
        n: sql<number>`count(*)::int`,
      })
      .from(backlogs)
      .innerJoin(users, and(eq(users.id, backlogs.userId), publicAuthor))
      // "N backlogs" on a suggestion card describes their PUBLIC presence —
      // private shelves don't count toward it (F3.10.1).
      .where(and(inArray(backlogs.userId, ids), eq(backlogs.isPublic, true)))
      .groupBy(backlogs.userId),
    db
      .select({
        userId: userFollows.followedUserId,
        n: sql<number>`count(*)::int`,
      })
      .from(userFollows)
      .innerJoin(
        users,
        and(eq(users.id, userFollows.followedUserId), publicAuthor),
      )
      .where(inArray(userFollows.followedUserId, ids))
      .groupBy(userFollows.followedUserId),
    db
      .select({
        userId: ranked.userId,
        posterUrl: ranked.posterUrl,
        mediaType: ranked.mediaType,
        total: ranked.total,
      })
      .from(ranked)
      .where(and(lte(ranked.rn, 3), isNotNull(ranked.posterUrl)))
      .orderBy(ranked.userId, ranked.rn),
  ]);

  const backlogMap = new Map(backlogCounts.map((r) => [r.userId, r.n]));
  const followerMap = new Map(followerCounts.map((r) => [r.userId, r.n]));
  const coverMap = new Map<
    string,
    { covers: SuggestedProfile["covers"]; total: number }
  >();
  for (const row of coverRows) {
    if (!row.posterUrl) continue;
    const entry = coverMap.get(row.userId) ?? { covers: [], total: row.total };
    entry.covers.push({ posterUrl: row.posterUrl, mediaType: row.mediaType });
    coverMap.set(row.userId, entry);
  }

  const now = Date.now();

  return candidates.map((c) => {
    const covers = coverMap.get(c.id) ?? { covers: [], total: 0 };
    const last = c.lastAt ? new Date(c.lastAt).getTime() : null;
    return {
      username: c.username ?? "",
      name: c.name ?? c.username ?? "",
      isFounder: c.isFounder,
      avatarHexes: hexes.get(c.id) ?? FALLBACK_ADN,
      backlogCount: backlogMap.get(c.id) ?? 0,
      followerCount: followerMap.get(c.id) ?? 0,
      covers: covers.covers,
      moreCount: Math.max(0, covers.total - covers.covers.length),
      lastActive: last === null ? null : activityBucket(last, now),
    };
  });
}

// ---------- siguiendo / seguidores (owner-only lists) ----------

/**
 * The stacked orbs of the feed's "sigues a N personas" row — deliberately NOT
 * getPeoplePage (30 rows + counts + aggregates for three 22px discs). Private
 * follows fall back to the neutral ADN pair; their library colors are theirs.
 */
export async function getFollowingPreview(
  viewerId: string,
  limit = 3,
): Promise<{ avatarHexes: [string, string] }[]> {
  const rows = await db
    .select({ userId: users.id, isPublic: users.isPublic })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followedUserId))
    .where(eq(userFollows.followerUserId, viewerId))
    .orderBy(desc(userFollows.createdAt), desc(userFollows.id))
    .limit(limit);

  const publicIds = rows.filter((r) => r.isPublic).map((r) => r.userId);
  const hexes = await avatarHexesFor(publicIds);
  return rows.map((r) => ({
    avatarHexes: hexes.get(r.userId) ?? FALLBACK_ADN,
  }));
}

/**
 * The viewer's OWN lists — never rendered for anyone else (F3.10 decision:
 * counts are public, lists are private). `mode` picks which side of the edge
 * the viewer sits on. Keyset-paginated on the follow row itself (same
 * millisecond-truncation rule as the feed's cursor — see olderThan).
 *
 * A follow whose target went private stays listed (dimmed, "perfil privado"):
 * it's the viewer's own relationship, and keeping the chip is what keeps it
 * un-followable — hiding the row would make the follow unremovable. But the
 * ROW is all that survives: their ADN colors and backlog count are computed
 * only for still-public users (a private library's colors are private too),
 * so a private row renders the neutral fallback orb.
 *
 * Followers with no public handle (a private account can follow — reading is
 * not publishing) are NOT listed as identities: they fold into `privateCount`,
 * one aggregate line. Identity only travels when it's public.
 */
export async function getPeoplePage(
  viewerId: string,
  mode: "following" | "followers",
  cursor: string | null = null,
): Promise<PeoplePage> {
  const after = decodeCursor(cursor);
  const edgeCol =
    mode === "following"
      ? userFollows.followedUserId
      : userFollows.followerUserId;
  const scopeCol =
    mode === "following"
      ? userFollows.followerUserId
      : userFollows.followedUserId;

  const identifiable = and(
    isNotNull(users.username),
    mode === "followers" ? eq(users.isPublic, true) : undefined,
  );

  const rows = await db
    .select({
      followId: userFollows.id,
      at: userFollows.createdAt,
      userId: users.id,
      username: users.username,
      name: users.name,
      isFounder: users.isFounder,
      isPublic: users.isPublic,
      // In "following" mode this is definitionally true (it IS the edge being
      // listed) — skip the correlated subquery instead of discarding it.
      following:
        mode === "following"
          ? sql<boolean>`true`
          : sql<boolean>`exists (select 1 from ${userFollows} f2 where f2.follower_user_id = ${viewerId} and f2.followed_user_id = ${users.id})`,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, edgeCol))
    .where(
      and(
        eq(scopeCol, viewerId),
        identifiable,
        after
          ? or(
              sql`date_trunc('milliseconds', ${userFollows.createdAt}) < ${after.at}`,
              and(
                sql`date_trunc('milliseconds', ${userFollows.createdAt}) = ${after.at}`,
                sql`${userFollows.id} < ${after.id}`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(userFollows.createdAt), desc(userFollows.id))
    .limit(PEOPLE_PAGE_SIZE + 1);

  const page = rows.slice(0, PEOPLE_PAGE_SIZE);
  // Batch reads only over still-PUBLIC users: a private account keeps its row
  // (the viewer's own edge) but not its library-derived colors or counts.
  const publicIds = [
    ...new Set(page.filter((r) => r.isPublic).map((r) => r.userId)),
  ];

  const [hexes, backlogCounts, privateAgg] = await Promise.all([
    avatarHexesFor(publicIds),
    publicIds.length > 0
      ? db
          .select({ userId: backlogs.userId, n: sql<number>`count(*)::int` })
          .from(backlogs)
          .innerJoin(users, and(eq(users.id, backlogs.userId), publicAuthor))
          // Public shelves only — same rule as the suggestion cards (F3.10.1).
          .where(
            and(
              inArray(backlogs.userId, publicIds),
              eq(backlogs.isPublic, true),
            ),
          )
          .groupBy(backlogs.userId)
      : Promise.resolve([]),
    // Followers hidden from the list above (no handle / private) — first page
    // only, as one aggregate count.
    mode === "followers" && !after
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(userFollows)
          .innerJoin(users, eq(users.id, userFollows.followerUserId))
          .where(
            and(
              eq(userFollows.followedUserId, viewerId),
              or(isNull(users.username), eq(users.isPublic, false)),
            ),
          )
      : Promise.resolve([{ n: 0 }]),
  ]);

  const backlogMap = new Map(backlogCounts.map((r) => [r.userId, r.n]));

  const people: PersonRow[] = page.map((r) => ({
    username: r.username ?? "",
    name: r.name ?? r.username ?? "",
    isFounder: r.isFounder,
    isPrivate: !r.isPublic,
    avatarHexes: r.isPublic
      ? (hexes.get(r.userId) ?? FALLBACK_ADN)
      : FALLBACK_ADN,
    backlogCount: r.isPublic ? (backlogMap.get(r.userId) ?? 0) : 0,
    following: r.following,
  }));

  const last = page.at(-1);
  return {
    people,
    privateCount: privateAgg[0]?.n ?? 0,
    nextCursor:
      rows.length > PEOPLE_PAGE_SIZE && last
        ? `${last.at.toISOString()}|${last.followId}`
        : null,
  };
}
