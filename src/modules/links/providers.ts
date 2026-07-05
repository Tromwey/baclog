import "server-only";
import { env } from "@/lib/env";

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
  const headers: HeadersInit = {};
  if (env.TMDB_API_KEY.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${env.TMDB_API_KEY}`;
  } else {
    url.searchParams.set("api_key", env.TMDB_API_KEY);
  }

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
