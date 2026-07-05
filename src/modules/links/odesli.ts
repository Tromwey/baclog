import "server-only";
import { env } from "@/lib/env";

export interface OdesliLinks {
  spotify?: string;
  apple_music?: string;
  youtube_music?: string;
}

/**
 * Odesli (song.link) — keyless free tier ~10 req/min shared. Called at
 * most once per catalog item thanks to the media_links cache (all
 * platforms from one call are persisted together).
 */
export async function resolveWithOdesli(
  sourceUrl: string,
): Promise<OdesliLinks | null> {
  const url = new URL("https://api.song.link/v1-alpha.1/links");
  url.searchParams.set("url", sourceUrl);
  if (env.ODESLI_API_KEY) url.searchParams.set("key", env.ODESLI_API_KEY);

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = await res.json();
  const platforms = data?.linksByPlatform ?? {};
  const pick = (k: string): string | undefined => platforms[k]?.url;

  const links: OdesliLinks = {
    spotify: pick("spotify"),
    apple_music: pick("appleMusic") ?? pick("itunes"),
    youtube_music: pick("youtubeMusic") ?? pick("youtube"),
  };
  return links.spotify || links.apple_music || links.youtube_music
    ? links
    : null;
}
