import "server-only";
import type { AlbumTrack } from "./itunes";
import { getAlbumTracks } from "./itunes";
import { getSpanishOverview } from "./tmdb";

interface DisplayMediaInput {
  source: string;
  mediaType: "film" | "series" | "album";
  externalId: string;
  synopsis: string | null;
}

/**
 * Per-item display media derived from the source provider at view time, shared
 * by the in-app and public item pages so the guard logic lives in one place:
 * an album's tracklist (iTunes) OR a film/series' Spanish synopsis (TMDB) — a
 * title is never both. Both fetches are cached (see the respective functions);
 * the synopsis falls back to the stored English when TMDB has no translation.
 */
export async function getItemDisplayMedia(item: DisplayMediaInput): Promise<{
  tracks: AlbumTrack[];
  synopsis: string | null;
}> {
  const tracks =
    item.mediaType === "album" && item.source === "itunes"
      ? await getAlbumTracks(item.externalId)
      : [];
  const synopsis =
    (item.source === "tmdb" && item.mediaType !== "album"
      ? await getSpanishOverview(item.externalId, item.mediaType)
      : null) ?? item.synopsis;
  return { tracks, synopsis };
}
