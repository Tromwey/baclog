import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { linkServiceEnum, mediaLinks } from "@/db/schema";
import type { CatalogItemRow } from "@/modules/catalog/cache";
import { buildSearchFallback, buildVideoFallback } from "./fallback";
import { getWatchLink, tmdbWatchPageUrl } from "./providers";
import { resolveTidalAlbum } from "./resolvers/tidal";
import type { ResolveOutcome } from "./resolvers/types";

export type MusicService = "spotify" | "apple_music" | "youtube_music" | "tidal";
type LinkService = (typeof linkServiceEnum.enumValues)[number];

/**
 * F2.11–F2.13 lazy resolution: cache hit → redirect; miss → resolve the
 * service and cache the answer forever (taps 2+ are cache hits). Never
 * returns a dead link: the search deep link is the floor, cached with
 * isSearchFallback so a later, better resolver can be told apart from it.
 *
 * Odesli (the old "one call brings every platform" upstream) retired its
 * public API on 2026-07-31, so exact links are now resolved per service:
 *   - apple_music: the catalog already stores the iTunes album page URL
 *     (`raw.collectionViewUrl`, track `?i=` stripped by itunes.ts) — exact,
 *     free, zero upstream calls.
 *   - tidal: official API search (client credentials) + confident matching
 *     in resolvers/match.ts; no credentials / 429 / 5xx / timeout → the
 *     search fallback is returned but NOT cached (next tap retries).
 *   - spotify: search fallback (Web API needs a Premium developer account
 *     since 2026-02; pending founder decision — see the brief).
 *   - youtube_music: search fallback by design (no album API).
 *
 * `region` (viewer country, from x-vercel-ip-country) only scopes the
 * upstream search; music links are cached region-less because album ids
 * are global.
 */
export async function resolveMusicLink(
  item: CatalogItemRow,
  service: MusicService,
  region = "MX",
): Promise<string> {
  const cached = await getCached(item.id, service, null);
  if (cached) return cached;

  const outcome = await resolveExactMusic(item, service, region);
  const fallback = buildSearchFallback(service, item.title, item.byline);
  // Transient upstream trouble: serve the floor, keep the cache empty so
  // the next tap gets another shot at the exact link.
  if (outcome.kind === "unavailable") return fallback;

  const url = outcome.kind === "exact" ? outcome.url : fallback;
  await db
    .insert(mediaLinks)
    .values({
      catalogItemId: item.id,
      service,
      region: null,
      url,
      isSearchFallback: outcome.kind !== "exact",
    })
    .onConflictDoNothing();
  return url;
}

/** Per-service exact album link. `none` = confidently no exact link (cache
 *  the fallback); `unavailable` = don't cache, retry on the next tap. */
async function resolveExactMusic(
  item: CatalogItemRow,
  service: MusicService,
  region: string,
): Promise<ResolveOutcome> {
  switch (service) {
    case "apple_music":
      return appleMusicFromCatalog(item);
    case "tidal":
      return resolveTidalAlbum(
        { title: item.title, byline: item.byline, year: item.year },
        region,
      );
    case "spotify":
    case "youtube_music":
      return { kind: "none" };
  }
}

/** The catalog already stores the iTunes album page — exact, free, no
 *  upstream call. Host-checked so a malformed `raw` can't redirect anywhere. */
function appleMusicFromCatalog(item: CatalogItemRow): ResolveOutcome {
  const raw = item.raw as { collectionViewUrl?: string } | null;
  const url = raw?.collectionViewUrl;
  if (!url) return { kind: "none" };
  try {
    const host = new URL(url).hostname;
    if (host !== "music.apple.com" && !host.endsWith(".apple.com")) {
      return { kind: "none" };
    }
  } catch {
    return { kind: "none" };
  }
  return { kind: "exact", url };
}

export async function resolveVideoLink(
  item: CatalogItemRow,
  region: string,
): Promise<string> {
  const cached = await getCached(item.id, "other", region);
  if (cached) return cached;

  // All video is TMDB-sourced. The link-out FLOOR is the TMDB "where to watch"
  // page (JustWatch-powered — matches the attribution next to the button), NOT
  // a raw web search: getWatchLink returns the API's slugged link when the
  // title already has provider rows; a title with none — a making-of
  // featurette, or a film not yet streaming in this region — still lands on
  // that same page, which lists providers the moment TMDB has them. Only a
  // non-TMDB video (which the catalog never produces) degrades to a search.
  if (item.source === "tmdb" && item.mediaType !== "album") {
    const watch = await getWatchLink(
      item.externalId,
      item.mediaType,
      region,
    ).catch(() => null);
    const url =
      watch?.url ?? tmdbWatchPageUrl(item.externalId, item.mediaType, region);
    await db
      .insert(mediaLinks)
      .values({
        catalogItemId: item.id,
        service: "other" as LinkService,
        region,
        url,
        // Not an exact provider match when we synthesized the page URL.
        isSearchFallback: !watch,
      })
      .onConflictDoNothing();
    return url;
  }

  const fallback = buildVideoFallback(item.title, item.year);
  await db
    .insert(mediaLinks)
    .values({
      catalogItemId: item.id,
      service: "other" as LinkService,
      region,
      url: fallback,
      isSearchFallback: true,
    })
    .onConflictDoNothing();
  return fallback;
}

async function getCached(
  catalogItemId: string,
  service: LinkService,
  region: string | null,
): Promise<string | null> {
  const [row] = await db
    .select({ url: mediaLinks.url })
    .from(mediaLinks)
    .where(
      and(
        eq(mediaLinks.catalogItemId, catalogItemId),
        eq(mediaLinks.service, service),
        region === null
          ? isNull(mediaLinks.region)
          : eq(mediaLinks.region, region),
      ),
    )
    .limit(1);
  return row?.url ?? null;
}
