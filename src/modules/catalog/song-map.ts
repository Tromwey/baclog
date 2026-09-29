/**
 * Colecciones de fiesta — the PURE half of the song catalog (itunes-songs.ts
 * holds the fetch and the upsert): the iTunes result → song mapping and the
 * reader of a stored song's `raw`. No DB, no `server-only`, so
 * `scripts/check-party-rules.ts` exercises it.
 */

export const SONG_SOURCE = "itunes-track";

/** The subset of an iTunes song result we keep in `catalog_item.raw`. */
export interface SongRaw {
  trackId: number;
  collectionId: number | null;
  artistId: number | null;
  trackName: string;
  artistName: string | null;
  collectionName: string | null;
  previewUrl: string | null;
  trackViewUrl: string | null;
  trackTimeMillis: number | null;
  trackExplicitness: string | null;
  isStreamable: boolean | null;
}

export interface ItunesSongResult {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  primaryGenreName?: string;
  trackExplicitness?: string;
  isStreamable?: boolean;
}

export interface SongItem {
  externalId: string;
  title: string;
  byline: string | null;
  year: number | null;
  genre: string | null;
  posterUrl: string | null;
  raw: SongRaw;
}

/** Only https URLs from Apple's hosts survive into the row. */
function appleUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (!/(^|\.)(apple\.com|mzstatic\.com)$/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Map one iTunes result to a song, or null when it isn't a playable-looking song. */
export function toSongItem(r: ItunesSongResult): SongItem | null {
  if (r.wrapperType !== "track" || r.kind !== "song") return null;
  if (typeof r.trackId !== "number" || !r.trackName) return null;
  const year = r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || null : null;
  return {
    externalId: String(r.trackId),
    title: r.trackName,
    byline: r.artistName ?? null,
    year,
    genre: r.primaryGenreName?.toLowerCase() ?? null,
    posterUrl: appleUrl(r.artworkUrl100?.replace("100x100bb", "600x600bb")),
    raw: {
      trackId: r.trackId,
      collectionId: typeof r.collectionId === "number" ? r.collectionId : null,
      artistId: typeof r.artistId === "number" ? r.artistId : null,
      trackName: r.trackName,
      artistName: r.artistName ?? null,
      collectionName: r.collectionName ?? null,
      previewUrl: appleUrl(r.previewUrl),
      trackViewUrl: appleUrl(r.trackViewUrl),
      trackTimeMillis: typeof r.trackTimeMillis === "number" ? r.trackTimeMillis : null,
      trackExplicitness: r.trackExplicitness ?? null,
      isStreamable: typeof r.isStreamable === "boolean" ? r.isStreamable : null,
    },
  };
}

/** Read the song facts back off a stored `raw` (tolerant: older/partial rows). */
export function songFactsOf(raw: unknown): {
  album: string | null;
  previewUrl: string | null;
  durationMs: number | null;
  appleMusicUrl: string | null;
  /** Apple Music catalog id = the iTunes trackId (music export, 0034). */
  appleMusicId: string | null;
} {
  const r = (raw ?? {}) as Partial<SongRaw>;
  return {
    appleMusicId: typeof r.trackId === "number" && Number.isSafeInteger(r.trackId) && r.trackId > 0 ? String(r.trackId) : null,
    album: typeof r.collectionName === "string" ? r.collectionName : null,
    previewUrl: typeof r.previewUrl === "string" ? r.previewUrl : null,
    durationMs: typeof r.trackTimeMillis === "number" ? r.trackTimeMillis : null,
    appleMusicUrl: typeof r.trackViewUrl === "string" ? r.trackViewUrl : null,
  };
}
