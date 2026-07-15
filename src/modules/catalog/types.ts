export type MediaType = "film" | "series" | "album";

export type SearchTab = MediaType | "all";

/** Canonical media order + Spanish UPPERCASE badges (mono-meta voice). One
 * source of truth for the badges shared across search, recos, and the item page. */
export const MEDIA_TYPES: MediaType[] = ["film", "series", "album"];
export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  film: "PELÍCULA",
  series: "SERIE",
  album: "ÁLBUM",
};

/** Same vocabulary, Title Case — for meta lines that render in mixed case
 * (item hero, public item page) rather than the force-uppercase mono-meta
 * badge voice above, so the type token doesn't shout inside an otherwise
 * sentence-case "Película · A24 · 2024 · Drama" string. Shared so the two
 * item-page twins can't drift (one had it, one omitted it — audit fix). */
export const MEDIA_TYPE_TITLE: Record<MediaType, string> = {
  film: "Película",
  series: "Serie",
  album: "Álbum",
};

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
  /** Cached cover palette (catalog_item) — present ⇒ the client skips on-device
   *  re-extraction on add; null ⇒ extract once and persist. */
  paletteHex: string[] | null;
}

/** The film/series search surface — real TMDB or fixtures (launch dep). */
export interface VideoCatalog {
  search(query: string, type: "film" | "series"): Promise<ExternalItem[]>;
  /**
   * F3.5.8 (link graph) — the "Original Music Composer" credit (film:
   * /movie/{id}/credits; series: /tv/{id}/aggregate_credits). OPTIONAL:
   * fixtures don't implement it (no crew data), and the link-graph extractor
   * degrades to iTunes-only edges when it's absent or errors.
   */
  getComposer?(
    externalId: string,
    type: "film" | "series",
  ): Promise<string | null>;
}
