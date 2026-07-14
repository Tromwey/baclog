import "server-only";
import { env } from "@/lib/env";
import { tmdbAuth } from "@/modules/catalog/tmdb";

/**
 * TMDB watch/providers (JustWatch data): regional availability. TMDB does
 * not expose direct provider deep links — it exposes a regional JustWatch
 * page listing where to stream, which is the link-out target (with the
 * mandatory JustWatch attribution rendered next to the button).
 */
export async function getWatchLink(
  tmdbId: string,
  mediaType: "film" | "series",
  region: string,
): Promise<{ url: string; providers: string[] } | null> {
  if (!env.TMDB_API_KEY) return null; // fixtures mode → caller falls back

  const kind = mediaType === "film" ? "movie" : "tv";
  const url = new URL(
    `https://api.themoviedb.org/3/${kind}/${tmdbId}/watch/providers`,
  );
  const headers = tmdbAuth(url, env.TMDB_API_KEY);

  const res = await fetch(url, { headers, next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  const regional = data?.results?.[region] ?? data?.results?.US;
  if (!regional?.link) return null;

  const providers = (regional.flatrate ?? [])
    .map((p: { provider_name?: string }) => p.provider_name)
    .filter(Boolean)
    .slice(0, 5);
  return { url: regional.link, providers };
}

/**
 * The canonical TMDB "where to watch" page for a title in a region — the same
 * destination getWatchLink returns on success (`regional.link`), buildable from
 * the id alone. Used as the video link-out FLOOR (resolve.ts): a title with no
 * provider rows (a featurette, or a film not yet streaming in this region)
 * still lands here — JustWatch-powered, matching the attribution next to the
 * button — instead of a raw web search, and starts listing providers the moment
 * TMDB has them. The slugless path 301-redirects to the slugged canonical URL.
 */
export function tmdbWatchPageUrl(
  tmdbId: string,
  mediaType: "film" | "series",
  region: string,
): string {
  const kind = mediaType === "film" ? "movie" : "tv";
  return `https://www.themoviedb.org/${kind}/${tmdbId}/watch?locale=${region}`;
}
