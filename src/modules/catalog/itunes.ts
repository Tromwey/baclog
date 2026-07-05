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
