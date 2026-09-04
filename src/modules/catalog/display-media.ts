import "server-only";
import type { AlbumTrack } from "./itunes";
import { getAlbumDetail } from "./itunes";
import { getSeriesFacts, getSpanishOverview } from "./tmdb";
import { cacheReleaseDate, cacheSeriesFacts } from "./cache";
import {
  SERIES_FACTS_AT_KEY,
  readSeriesFacts,
  seriesFactsAreStale,
  seriesStatusFromFacts,
  type SeriesStatus,
} from "./series-status";

interface DisplayMediaInput {
  id: string;
  source: string;
  mediaType: "film" | "series" | "album";
  externalId: string;
  synopsis: string | null;
  releaseDate: Date | null;
  /** `catalog_item.raw` — the series facts live inside it (see series-status.ts). */
  raw: unknown;
}

/**
 * Series status pill (Revamp UI 06c/06d): "Terminada · 1 temporada". Reads
 * the TMDB `/tv/{id}` facts off `raw`; on a miss (never enriched) or a stale
 * airing series (>7 days, ended ones never re-check) fetches them and merges
 * them back onto the row, so the next view of this title — by anyone — is a
 * pure read. Fail-open: any upstream failure keeps the stored facts if there
 * are any, else null → the pill just doesn't render. Never throws.
 */
export async function getSeriesStatus(
  item: Pick<DisplayMediaInput, "id" | "source" | "mediaType" | "externalId" | "raw">,
): Promise<SeriesStatus | null> {
  if (item.mediaType !== "series" || item.source !== "tmdb") return null;
  const stored = readSeriesFacts(item.raw);
  if (stored && !seriesFactsAreStale(stored)) return seriesStatusFromFacts(stored);

  const fresh = await getSeriesFacts(item.externalId);
  if (!fresh) return seriesStatusFromFacts(stored);
  await cacheSeriesFacts(item.id, {
    ...fresh,
    [SERIES_FACTS_AT_KEY]: new Date().toISOString(),
  });
  return seriesStatusFromFacts(fresh);
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
 *
 * A series ALSO carries its status pill facts (`getSeriesStatus`), persisted
 * the same self-healing way.
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
  /** Series only (TMDB): the status pill's data, null for anything else. */
  seriesStatus: SeriesStatus | null;
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

  const [esOverview, seriesStatus] = await Promise.all([
    item.source === "tmdb" && item.mediaType !== "album"
      ? getSpanishOverview(item.externalId, item.mediaType)
      : null,
    getSeriesStatus(item),
  ]);
  const synopsis = esOverview ?? item.synopsis;

  return {
    tracks: detail.tracks,
    trackCount: detail.trackCount,
    synopsis,
    releaseDate: detail.releaseDate ?? item.releaseDate,
    seriesStatus,
  };
}
