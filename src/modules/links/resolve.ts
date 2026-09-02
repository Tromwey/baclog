import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { linkServiceEnum, mediaLinks } from "@/db/schema";
import type { CatalogItemRow } from "@/modules/catalog/cache";
import { buildSearchFallback, buildVideoFallback } from "./fallback";
import { getWatchLink, tmdbWatchPageUrl } from "./providers";

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
 *   - spotify / youtube_music / tidal: search fallback until the per-service
 *     resolvers (brief "link-out post-Odesli", fase 2) land.
 */
export async function resolveMusicLink(
  item: CatalogItemRow,
  service: MusicService,
): Promise<string> {
  const cached = await getCached(item.id, service, null);
  if (cached) return cached;

  const exact = resolveExactMusicUrl(item, service);
  const url = exact ?? buildSearchFallback(service, item.title, item.byline);
  await db
    .insert(mediaLinks)
    .values({
      catalogItemId: item.id,
      service,
      region: null,
      url,
      isSearchFallback: exact === null,
    })
    .onConflictDoNothing();
  return url;
}

/** Exact album URL for `service` when we can get one without an upstream
 *  call; null means "no exact link known" → search fallback. */
function resolveExactMusicUrl(
  item: CatalogItemRow,
  service: MusicService,
): string | null {
  if (service !== "apple_music") return null;
  const raw = item.raw as { collectionViewUrl?: string } | null;
  const url = raw?.collectionViewUrl;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host !== "music.apple.com" && !host.endsWith(".apple.com")) return null;
  } catch {
    return null;
  }
  return url;
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
