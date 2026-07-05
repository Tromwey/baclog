export type MediaType = "film" | "series" | "album";

export type SearchTab = MediaType | "all";

/** Normalized result shape — the app never sees raw TMDB/iTunes payloads. */
export interface ExternalItem {
  source: "tmdb" | "itunes";
  externalId: string;
  mediaType: MediaType;
  title: string;
  /** Studio/network for video, artist for music */
  byline: string | null;
  year: number | null;
  genre: string | null;
  synopsis: string | null;
  /** Hotlink to image.tmdb.org / mzstatic — never proxied (ADR-007) */
  posterUrl: string | null;
  sourceRating: number | null;
  isrc: string | null;
  upc: string | null;
  raw: unknown;
}

/** What the search endpoint returns to the client. */
export interface CatalogSearchResult {
  catalogItemId: string;
  source: "tmdb" | "itunes";
  mediaType: MediaType;
  title: string;
  byline: string | null;
  year: number | null;
  posterUrl: string | null;
}

/** The film/series search surface — real TMDB or fixtures (launch dep). */
export interface VideoCatalog {
  search(query: string, type: "film" | "series"): Promise<ExternalItem[]>;
}
