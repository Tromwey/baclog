import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { linkServiceEnum, mediaLinks } from "@/db/schema";
import type { CatalogItemRow } from "@/modules/catalog/cache";
import { buildSearchFallback, buildVideoFallback } from "./fallback";
import { resolveWithOdesli } from "./odesli";
import { getWatchLink, tmdbWatchPageUrl } from "./providers";

export type MusicService = "spotify" | "apple_music" | "youtube_music";
type LinkService = (typeof linkServiceEnum.enumValues)[number];

/**
 * F2.11–F2.13 lazy resolution: cache hit → redirect; miss → one upstream
 * call fans out to every service we learn about → cached forever (taps 2+
 * are cache hits, respecting Odesli's shared free tier). Never returns a
 * dead link: search fallback is the floor, cached with isSearchFallback.
 */
export async function resolveMusicLink(
  item: CatalogItemRow,
  service: MusicService,
): Promise<string> {
  const cached = await getCached(item.id, service, null);
  if (cached) return cached;

  const raw = item.raw as { collectionViewUrl?: string } | null;
  const sourceUrl = raw?.collectionViewUrl;
  if (sourceUrl) {
    const links = await resolveWithOdesli(sourceUrl).catch(() => null);
    if (links) {
      const rows = (
        Object.entries(links) as [MusicService, string | undefined][]
      )
        .filter((e): e is [MusicService, string] => Boolean(e[1]))
        .map(([svc, url]) => ({
          catalogItemId: item.id,
          service: svc,
          region: null,
          url,
          isSearchFallback: false,
        }));
      if (rows.length > 0) {
        await db.insert(mediaLinks).values(rows).onConflictDoNothing();
      }
      if (links[service]) return links[service];
    }
  }

  // No exact match → cache the search deep link so we never re-hit Odesli
  const fallback = buildSearchFallback(service, item.title, item.byline);
  await db
    .insert(mediaLinks)
    .values({
      catalogItemId: item.id,
      service,
      region: null,
      url: fallback,
      isSearchFallback: true,
    })
    .onConflictDoNothing();
  return fallback;
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
