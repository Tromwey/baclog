import "server-only";
import type { AlbumTrack } from "./itunes";
import { getAlbumDetail } from "./itunes";
import { getSpanishOverview } from "./tmdb";
import { cacheReleaseDate } from "./cache";

interface DisplayMediaInput {
  id: string;
  source: string;
  mediaType: "film" | "series" | "album";
  externalId: string;
  synopsis: string | null;
  releaseDate: Date | null;
}

/**
 * Per-item display media derived from the source provider at view time, shared
 * by the in-app and public item pages so the guard logic lives in one place:
 * an album's tracklist (iTunes) OR a film/series' Spanish synopsis (TMDB) — a
 * title is never both. Both fetches are cached (see the respective functions);
 * the synopsis falls back to the stored English when TMDB has no translation.
 *
 * F3.8: that album lookup ALSO carries the release date, so VIEWING an item is
 * what teaches the catalog when a pre-order lands — self-healing, at the cost
 * of zero extra requests (the call was already happening for the tracklist).
 * It's why an album added while unreleased doesn't stay dateless: the first
 * view of its page fills the date in, for every user afterwards.
 */
export async function getItemDisplayMedia(item: DisplayMediaInput): Promise<{
  tracks: AlbumTrack[];
  /** The album's full song count — exceeds tracks.length before release. */
  trackCount: number;
  synopsis: string | null;
  /** Freshest known release date: what the provider just said, else the stored
   *  value. Callers derive the countdown from THIS, not from the row they read
   *  a moment ago, so a date that moved takes effect on the same render. */
  releaseDate: Date | null;
}> {
  const isAlbum = item.mediaType === "album" && item.source === "itunes";
  const detail = isAlbum
    ? await getAlbumDetail(
        item.externalId,
        !item.releaseDate || item.releaseDate.getTime() > Date.now()
          ? "pending"
          : "settled",
      )
    : {
        tracks: [] as AlbumTrack[],
        trackCount: 0,
        releaseDate: null,
        posterUrl: null,
      };

  if (isAlbum) {
    await cacheReleaseDate(item.id, detail.releaseDate, item.releaseDate);
  }

  const synopsis =
    (item.source === "tmdb" && item.mediaType !== "album"
      ? await getSpanishOverview(item.externalId, item.mediaType)
      : null) ?? item.synopsis;

  return {
    tracks: detail.tracks,
    trackCount: detail.trackCount,
    synopsis,
    releaseDate: detail.releaseDate ?? item.releaseDate,
  };
}
