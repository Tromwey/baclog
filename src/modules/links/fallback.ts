import "server-only";

/**
 * F2.13 — degraded but never dead: when no exact match exists, deep-link
 * into a search inside the target service so the tap always lands
 * somewhere useful.
 */
export function buildSearchFallback(
  service: "spotify" | "apple_music" | "youtube_music",
  title: string,
  byline: string | null,
): string {
  const q = encodeURIComponent([title, byline].filter(Boolean).join(" "));
  switch (service) {
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
  }
}

/** Video fallback when providers are unknown: a web search that resolves. */
export function buildVideoFallback(title: string, year: number | null): string {
  const q = encodeURIComponent(`watch ${title}${year ? ` ${year}` : ""}`);
  return `https://www.google.com/search?q=${q}`;
}
