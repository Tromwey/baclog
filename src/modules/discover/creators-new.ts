import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems, userItems } from "@/db/schema";
import { storefrontOr } from "@/modules/catalog/apple-music-map";
import { getArtistReleases } from "@/modules/catalog/itunes";
import {
  getCreatorSeries,
  getDirectorFilms,
  getFilmDirectors,
  getSeriesCreators,
  type TmdbPerson,
} from "@/modules/catalog/tmdb";
import type { ExternalItem, MediaType } from "@/modules/catalog/types";
import { ensureCatalogRows, refKey } from "./catalog-rows";

/**
 * Descubrir · "lo nuevo de tus favoritos" (founder, 2026-09-29: "lo más nuevo
 * de artistas, directores"): recent and upcoming work by the people behind
 * the titles the viewer loves.
 *
 * SEEDS — the viewer's OWN `user_item` (an own-user read, no cross-user data
 * at all), in priority order obsessed → liked → completed → most recently
 * added, never a title marked "no me gustó": up to `ALBUM_SEEDS` distinct artists, `FILM_SEEDS` films and
 * `SERIES_SEEDS` series.
 *  - Artists: the iTunes `artistId` in the stored album payload
 *    (`catalog_item.raw`) → `getArtistReleases` (albums of the last 120 days +
 *    everything unreleased, singles out; same discography lookup and 6h cache
 *    as `getArtistUpcoming`).
 *  - Film directors: `/movie/{id}/credits` (30d) → `/person/{id}/movie_credits`
 *    crew job Director (24h), released within the last 180 days or later.
 *  - Series creators: `/tv/{id}` `created_by` (30d) → `/person/{id}/tv_credits`
 *    crew job Creator (24h), first aired in the same window.
 * Studios / productoras are deliberately SKIPPED: an A24 or a Netflix ships
 * far too much for "lo nuevo de tus favoritos" to mean anything.
 *
 * BUDGET — at most ~24 external calls on a cold load (6 artist lookups, 6
 * film credits, 4 series details, then ≤5 directors + ≤3 creators), all in
 * `Promise.allSettled` with a 4s per-call timeout and a Next fetch cache;
 * every failure is open (that creator just contributes nothing). Warm, it is
 * one library query + one catalog read.
 *
 * Results go through `ensureCatalogRows` (the search upsert, only for rows
 * that changed) so each has a `catalogItemId`; anything in the viewer's
 * library is dropped (seeds included — they are library rows), deduped,
 * at most `PER_CREATOR` per creator, ordered by closeness of the release day
 * to now (upcoming and recent interleave), then `limit`.
 */

export interface CreatorNewItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
  releaseDate: string | null;
  creator: { name: string; role: "artist" | "director" | "creator" };
}

const ALBUM_SEEDS = 6;
const FILM_SEEDS = 6;
const SERIES_SEEDS = 4;
const MAX_DIRECTORS = 5;
const MAX_CREATORS = 3;
const PER_CREATOR = 2;
const DAY = 24 * 60 * 60 * 1000;
const ALBUM_WINDOW_DAYS = 120;
const VIDEO_WINDOW_DAYS = 180;

interface Found {
  item: ExternalItem;
  creator: CreatorNewItem["creator"];
  /** Groups the per-creator cap: `artist:123`, `person:456`. */
  creatorKey: string;
}

export async function getNewFromCreators(
  viewerId: string,
  now: number,
  limit = 12,
): Promise<CreatorNewItem[]> {
  const library = await db
    .select({
      catalogItemId: catalogItems.id,
      source: catalogItems.source,
      externalId: catalogItems.externalId,
      mediaType: catalogItems.mediaType,
      artistId: sql<string | null>`${catalogItems.raw}->>'artistId'`,
      // The Apple Music store that album came from: its artist is looked up there.
      storefront: sql<string | null>`${catalogItems.raw}->>'_storefront'`,
      verdict: userItems.verdict,
    })
    .from(userItems)
    .innerJoin(catalogItems, eq(catalogItems.id, userItems.catalogItemId))
    .where(eq(userItems.userId, viewerId))
    .orderBy(
      desc(userItems.obsessed),
      desc(sql`coalesce(${userItems.verdict} = 'liked', false)`),
      desc(sql`${userItems.status} = 'completed'`),
      desc(userItems.addedAt),
    );
  if (library.length === 0) return [];

  const artistIds: number[] = [];
  const artistStore = new Map<number, string>();
  const films: string[] = [];
  const series: string[] = [];
  for (const r of library) {
    // "No me gustó" never seeds "tus favoritos", even if completed.
    if (r.verdict === "disliked") continue;
    if (r.mediaType === "album" && r.source === "itunes") {
      const id = Number(r.artistId);
      if (Number.isSafeInteger(id) && id > 0 && !artistIds.includes(id) && artistIds.length < ALBUM_SEEDS) {
        artistIds.push(id);
        artistStore.set(id, storefrontOr(r.storefront));
      }
    } else if (r.source === "tmdb" && r.mediaType === "film" && films.length < FILM_SEEDS) {
      films.push(r.externalId);
    } else if (r.source === "tmdb" && r.mediaType === "series" && series.length < SERIES_SEEDS) {
      series.push(r.externalId);
    }
  }

  const artistsRun = settled(
    artistIds.map(async (artistId): Promise<Found[]> => {
      const { artistName, items } = await getArtistReleases(
        artistId,
        now,
        ALBUM_WINDOW_DAYS,
        undefined,
        artistStore.get(artistId),
      );
      return items.map((item) => ({
        item,
        creator: { name: artistName ?? item.byline ?? "", role: "artist" as const },
        creatorKey: `artist:${artistId}`,
      }));
    }),
  );
  const videoRun = (async (): Promise<Found[]> => {
    const [directorLists, creatorLists] = await Promise.all([
      settled(films.map(getFilmDirectors)),
      settled(series.map(getSeriesCreators)),
    ]);
    const since = now - VIDEO_WINDOW_DAYS * DAY;
    const directors = distinctPeople(directorLists, MAX_DIRECTORS);
    const creators = distinctPeople(creatorLists, MAX_CREATORS);
    const [byDirector, byCreator] = await Promise.all([
      settled(
        directors.map(async (p) =>
          (await getDirectorFilms(p.id, since)).map((item) => ({
            item,
            creator: { name: p.name, role: "director" as const },
            creatorKey: `person:${p.id}`,
          })),
        ),
      ),
      settled(
        creators.map(async (p) =>
          (await getCreatorSeries(p.id, since)).map((item) => ({
            item,
            creator: { name: p.name, role: "creator" as const },
            creatorKey: `person:${p.id}`,
          })),
        ),
      ),
    ]);
    return [...byDirector.flat(), ...byCreator.flat()];
  })();

  const found = [...(await artistsRun).flat(), ...(await videoRun)].filter(
    (f) => f.item.posterUrl && f.item.releaseDate && f.creator.name,
  );
  if (found.length === 0) return [];

  const refs = await ensureCatalogRows(found.map((f) => f.item));
  const owned = new Set(library.map((r) => r.catalogItemId));
  const ownedRefs = new Set(library.map((r) => refKey(r)));

  const candidates = found
    .flatMap((f) => {
      const ref = refs.get(refKey(f.item));
      if (!ref || owned.has(ref.catalogItemId) || ownedRefs.has(refKey(f.item))) return [];
      const at = (ref.releaseDate ?? f.item.releaseDate)?.getTime();
      if (at === undefined || !ref.posterUrl) return [];
      return [{ f, ref, at }];
    })
    .sort((a, b) => Math.abs(a.at - now) - Math.abs(b.at - now));

  const seen = new Set<string>();
  const perCreator = new Map<string, number>();
  const out: CreatorNewItem[] = [];
  for (const { f, ref, at } of candidates) {
    if (out.length >= limit) break;
    if (seen.has(ref.catalogItemId)) continue;
    const n = perCreator.get(f.creatorKey) ?? 0;
    if (n >= PER_CREATOR) continue;
    seen.add(ref.catalogItemId);
    perCreator.set(f.creatorKey, n + 1);
    out.push({
      catalogItemId: ref.catalogItemId,
      title: ref.title,
      mediaType: ref.mediaType,
      posterUrl: ref.posterUrl,
      paletteHex: ref.paletteHex,
      releaseDate: new Date(at).toISOString(),
      creator: f.creator,
    });
  }
  return out;
}

/** `Promise.allSettled` keeping the fulfilled values; a rejection is logged
 *  (the helpers already fail open, so this is the belt to their braces). */
async function settled<T>(tasks: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  const out: T[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
    else console.error("[descubrir] creators: a lookup failed:", r.reason);
  }
  return out;
}

/** First-seen people across the seed lists (seed priority order), capped. */
function distinctPeople(lists: TmdbPerson[][], cap: number): TmdbPerson[] {
  const out: TmdbPerson[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (out.length >= cap) return out;
      if (!out.some((q) => q.id === p.id)) out.push(p);
    }
  }
  return out;
}
