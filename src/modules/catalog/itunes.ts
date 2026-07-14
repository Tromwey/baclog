import "server-only";
import type { ExternalItem } from "./types";

interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
}

/**
 * iTunes Search API — keyless (ADR-007). Artwork HD trick: the 100x100
 * CDN URL serves any size by rewriting the dimension segment.
 */
export async function searchAlbums(query: string): Promise<ExternalItem[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "10");
  url.searchParams.set("media", "music");

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`iTunes search: ${res.status}`);
  const data = await res.json();

  return (data.results as ItunesAlbum[]).map((a) => ({
    source: "itunes",
    externalId: String(a.collectionId),
    mediaType: "album",
    title: a.collectionName,
    byline: a.artistName,
    year: a.releaseDate ? Number(a.releaseDate.slice(0, 4)) || null : null,
    genre: a.primaryGenreName?.toLowerCase() ?? null,
    synopsis: null,
    posterUrl: a.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
    sourceRating: null,
    isrc: null,
    // UPC requires a lookup call; deferred to link resolution (G4) where
    // it actually matters as the canonical key
    upc: null,
    raw: a,
  }));
}

export interface AlbumTrack {
  /** Play-order position (disc-flattened). */
  n: number;
  name: string;
  durationMs: number | null;
}

/**
 * An album's tracklist via the keyless iTunes lookup (ADR-007). Track names are
 * the album equivalent of a film's synopsis: metadata/FACTS, the "receipt" safe
 * zone (ADR-008) — fetched server-side like the rest of the catalog. This is
 * text, not artwork, so the "never proxy images" rule (images only) does not
 * apply. Cached 30d: a released album's tracklist is effectively immutable.
 * Returns [] on any failure — the caller just omits the section.
 *
 * `collectionId` is the album's iTunes id, stored as catalog_item.externalId.
 */
export async function getAlbumTracks(collectionId: string): Promise<AlbumTrack[]> {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", collectionId);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "300");

  try {
    const res = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = (data.results ?? []) as Array<{
      wrapperType?: string;
      trackNumber?: number;
      discNumber?: number;
      trackName?: string;
      trackTimeMillis?: number;
    }>;
    return rows
      .filter((r) => r.wrapperType === "track" && Boolean(r.trackName))
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      )
      .map((t) => ({
        n: t.trackNumber ?? 0,
        name: t.trackName as string,
        durationMs:
          typeof t.trackTimeMillis === "number" ? t.trackTimeMillis : null,
      }));
  } catch {
    return [];
  }
}
