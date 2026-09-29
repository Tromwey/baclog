import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems, users } from "@/db/schema";
import { discoverUpcomingVideo, type RankedVideo } from "@/modules/catalog/tmdb";
import type { MediaType } from "@/modules/catalog/types";
import { notBlockedWith } from "@/modules/social/block-gate";
import { publicAuthor } from "@/modules/social/queries";
import { ensureCatalogRows, refKey, type CatalogRef } from "./catalog-rows";
import { notInLibrary } from "./library-gate";

/**
 * Descubrir · "los más esperados" (founder, 2026-09-29): what's coming out,
 * ordered by HOW MANY KURA PEOPLE SAVED IT — then by how popular the provider
 * says it is, then soonest first.
 *
 * Two candidate pools, merged and deduped by `catalogItemId`:
 *  - KURA: every `catalog_item` with `release_date > now` that at least one
 *    COUNTABLE person (see `waiting`) has a `user_item` for, top `KURA_POOL`
 *    by that count.
 *  - PROVIDER: TMDB `/discover/movie` (upcoming THEATRICAL release in Mexico)
 *    + `/discover/tv` (above a popularity floor) from tomorrow, by popularity
 *    and interleaved film/series by rank (one page each, 6h fetch cache, 4s
 *    timeout, fail-open to []; filters in `tmdb.ts` `discoverUpcomingVideo`),
 *    persisted through `ensureCatalogRows` (the search upsert, only for rows
 *    that changed) so each hit has a `catalogItemId`, then counted like the
 *    Kura pool. There is NO album provider feed (iTunes has no "upcoming"
 *    chart), so albums come only from the Kura pool.
 *
 * `waiting` is a GATED cross-user count (orchestrator decision, 2026-09-29 —
 * the posture of trending's "N personas", NOT the anonymous `title-stats`
 * one): `user_item` rows (unique per user + title, so distinct people) whose
 * owner passes `publicAuthor` (isPublic + username) AND `notBlockedWith` the
 * viewer, both INSIDE the query. So a private account's save, or one from
 * someone who blocked you / you blocked, neither adds to a count nor decides
 * which titles get listed. Only the number leaves this module: no user id,
 * no handle, no per-user field.
 *
 * The provider stage (TMDB + the catalog upsert) runs under a total budget
 * (`PROVIDER_BUDGET_MS`): this sits on Descubrir's SSR critical path, so if
 * TMDB is slow the answer is the Kura pool alone (logged); the catalog writes
 * already in flight are left to finish.
 *
 * Nothing already in the viewer's library appears ("no tiene caso ver cosas
 * que ya conoces en descubrir"): `notInLibrary` inside the Kura query, and
 * the same `user_item` scan that counts the provider hits flags the viewer's
 * own. Posterless titles are dropped (a Descubrir card IS its cover).
 */

export interface AnticipatedItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  /** ISO instant, always in the future. */
  releaseDate: string;
  /** Distinct Kura users with a user_item for it (an anonymous count). */
  waiting: number;
}

/** Kura candidates considered before the merge. */
const KURA_POOL = 60;

/** Total time the provider stage may add to the response (SSR path). */
const PROVIDER_BUDGET_MS = 1500;

interface Candidate {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  releaseDate: Date;
  waiting: number;
  /** Provider popularity rank (0 = most popular); Kura-only = Infinity. */
  rank: number;
}

export async function getMostAnticipated(
  viewerId: string,
  now: number,
  limit = 12,
  opts: { mediaType?: MediaType } = {},
): Promise<AnticipatedItem[]> {
  const at = new Date(now);
  const [kura, providerRefs] = await Promise.all([
    kuraCandidates(viewerId, at, opts.mediaType),
    withinBudget(providerStage(now, opts.mediaType)),
  ]);

  const byId = new Map<string, Candidate>();
  for (const k of kura) {
    if (!k.releaseDate || !k.posterUrl) continue;
    byId.set(k.catalogItemId, { ...k, releaseDate: k.releaseDate, rank: Infinity });
  }

  if (providerRefs.length > 0) {
    const ranked = providerRefs;
    const counts = await waitingFor(
      viewerId,
      ranked.map((p) => p.ref.catalogItemId),
    );
    for (const { ref, rank } of ranked) {
      const c = counts.get(ref.catalogItemId);
      if (c?.mine) continue;
      const known = byId.get(ref.catalogItemId);
      if (known) {
        known.rank = Math.min(known.rank, rank);
        continue;
      }
      if (!ref.posterUrl || !ref.releaseDate || ref.releaseDate.getTime() <= now) continue;
      if (opts.mediaType && ref.mediaType !== opts.mediaType) continue;
      byId.set(ref.catalogItemId, {
        catalogItemId: ref.catalogItemId,
        title: ref.title,
        mediaType: ref.mediaType,
        posterUrl: ref.posterUrl,
        paletteHex: ref.paletteHex,
        releaseDate: ref.releaseDate,
        waiting: c?.waiting ?? 0,
        rank,
      });
    }
  }

  return [...byId.values()]
    .sort(
      (a, b) =>
        b.waiting - a.waiting ||
        a.rank - b.rank ||
        a.releaseDate.getTime() - b.releaseDate.getTime(),
    )
    .slice(0, limit)
    .map((c) => ({
      catalogItemId: c.catalogItemId,
      title: c.title,
      mediaType: c.mediaType,
      posterUrl: c.posterUrl,
      paletteHex: c.paletteHex,
      releaseDate: c.releaseDate.toISOString(),
      waiting: c.waiting,
    }));
}

/** Upcoming titles by how many countable people have them, minus the
 *  viewer's own. A title only private/blocked accounts saved never appears. */
async function kuraCandidates(viewerId: string, at: Date, mediaType: MediaType | undefined) {
  const waiting = sql<number>`count(*)::int`;
  return db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      mediaType: catalogItems.mediaType,
      posterUrl: catalogItems.posterUrl,
      paletteHex: catalogItems.paletteHex,
      releaseDate: catalogItems.releaseDate,
      waiting,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .innerJoin(
      users,
      and(eq(users.id, userItems.userId), publicAuthor, notBlockedWith(viewerId, users.id)),
    )
    .where(
      and(
        gt(catalogItems.releaseDate, at),
        isNotNull(catalogItems.posterUrl),
        mediaType ? eq(catalogItems.mediaType, mediaType) : undefined,
        notInLibrary(viewerId, catalogItems.id),
      ),
    )
    .groupBy(catalogItems.id)
    .orderBy(desc(waiting), asc(catalogItems.releaseDate))
    .limit(KURA_POOL);
}

interface RankedRef {
  ref: CatalogRef;
  rank: number;
}

/** TMDB candidates → catalog rows, in rank order (fail-open to []). */
async function providerStage(now: number, mediaType: MediaType | undefined): Promise<RankedRef[]> {
  const provider = await providerCandidates(now, mediaType);
  if (provider.length === 0) return [];
  const refs = await ensureCatalogRows(provider.map((p) => p.item)).catch((err) => {
    console.error("[descubrir] anticipated: catalog rows failed:", err);
    return new Map<string, CatalogRef>();
  });
  return provider.flatMap((p, rank) => {
    const ref = refs.get(refKey(p.item));
    return ref ? [{ ref, rank }] : [];
  });
}

/** The provider stage, or [] once `PROVIDER_BUDGET_MS` is spent (warned). The
 *  stage keeps running in the background; its writes finish on their own. */
async function withinBudget(stage: Promise<RankedRef[]>): Promise<RankedRef[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROVIDER_BUDGET_MS);
  });
  try {
    const out = await Promise.race([stage, timeout]);
    if (out === null) {
      console.warn(`[descubrir] anticipated: provider stage over ${PROVIDER_BUDGET_MS}ms, Kura pool only`);
      return [];
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** TMDB's popular upcoming film + TV, interleaved by rank (fail-open). */
async function providerCandidates(now: number, mediaType: MediaType | undefined): Promise<RankedVideo[]> {
  if (mediaType === "album") return [];
  const tomorrow = new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const types: ("film" | "series")[] = mediaType ? [mediaType] : ["film", "series"];
  const lists = await Promise.all(
    types.map((t) =>
      discoverUpcomingVideo(t, tomorrow).catch((err) => {
        console.error(`[descubrir] anticipated: TMDB ${t} failed:`, err);
        return [] as RankedVideo[];
      }),
    ),
  );
  // Interleave by position, not by raw popularity: TMDB's movie and TV scores
  // live on different scales (upcoming films ~15–170, series ~10–20), so a
  // straight sort would bury every series under every film.
  const out: RankedVideo[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

/** Gated `waiting` count per title (same gate as `kuraCandidates`) + whether
 *  the viewer has it (ungated: the viewer's own row, public or not). */
async function waitingFor(
  viewerId: string,
  ids: string[],
): Promise<Map<string, { waiting: number; mine: boolean }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      catalogItemId: userItems.catalogItemId,
      waiting: sql<number>`(count(*) filter (where ${and(publicAuthor, notBlockedWith(viewerId, users.id))}))::int`,
      mine: sql<boolean>`bool_or(${userItems.userId} = ${viewerId})`,
    })
    .from(userItems)
    .innerJoin(users, eq(users.id, userItems.userId))
    .where(inArray(userItems.catalogItemId, [...new Set(ids)]))
    .groupBy(userItems.catalogItemId);
  return new Map(rows.map((r) => [r.catalogItemId, { waiting: r.waiting, mine: r.mine }]));
}
