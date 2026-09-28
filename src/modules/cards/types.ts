export type MediaType = "film" | "series" | "album";

export type ItemStatus = "on-my-radar" | "in-progress" | "completed";

export type ItemReaction = "disliked" | "liked" | "obsessed";

export interface CardItem {
  title: string;
  /** Artist for music, studio/network for film & series */
  byline: string;
  type: MediaType;
  year: number;
  genre: string;
  mood: string;
  status: ItemStatus;
  /** The reaction axis (F3.7). The title card prints obsessed/liked; "disliked" prints nothing. */
  reaction?: ItemReaction;
  /**
   * Cover-derived dominant hexes (catalog_item.paletteHex, vividness-ranked).
   * The cards tint their surface and paint each cover as this palette's no-art
   * recipe; absent → the neutral surface. Color is not artwork (ADR-008: the
   * one sanctioned bridge from cover to card).
   */
  palette?: string[];
  /**
   * `catalog_item.releaseDate` as ISO, when known. A date still in the future
   * is the derived "no puedo esperar" state (same rule as F3.8: never
   * persisted, it expires by itself) and the title card prints it as a date.
   */
  releaseDate?: string;
}

export interface CardBacklog {
  name: string;
  /** The collection's line ("lo que te rompe y lo agradeces"); the
   *  collection card prints it under the name. */
  vibe?: string;
  username: string;
  items: CardItem[];
  /**
   * The monthly recap's own data (style `recap`): the month and its four
   * numbers, the same ones the recap screen shows (`RecapMonth`). The items
   * then come top first ("lo más tuyo", the fan's front) — see
   * `toRecapCardBacklog` in adapter.ts.
   */
  recap?: RecapCardData;
}

export interface RecapCardData {
  /** "2026-09" */
  eraKey: string;
  completed: number;
  obsessions: number;
  reviews: number;
  saved: number;
}

/**
 * `title` = one title from the ficha (render/title.ts), `collection` = the
 * 9:16 fan card (Colecciones formalizado · 4b), `recap` = the monthly recap
 * (render/recap.ts).
 * The style also names the downloaded file (`kura-{style}.png`).
 */
export type CardStyle = "title" | "recap" | "collection";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

/* ============================================================
   Double Feature — the ⭐ cross-media SHARE card (F3.5.2 / ADR-008).
   Presentational contract only: the F3.5.5 agent feeds real data
   (seed work the user loved + LLM cross-media reco + extracted
   palette + narrative). Exported PNG is palette + grain + type ONLY,
   never cover art (ADR-008 enforced by the shape: no image fields).
   ============================================================ */

/** One work on the Double Feature (Side A seed or Side B reco). */
export interface DoubleFeatureWork {
  /** Display title, e.g. "F1" or "Rosie". */
  title: string;
  /** Media type — drives the disc treatment (reel vs. vinyl). */
  type: MediaType;
  /** Creator / studio / artist. Optional on the seed. */
  creator?: string;
  /** Release year. */
  year?: number;
  /**
   * Metadata line under the title, e.g. "2H 46M" (film) or "12 TRK"
   * (album). Pre-formatted by the caller — the card just renders it.
   */
  meta?: string;
}

/** Side B (the album reco) carries a J-card spine tracklist. */
export interface DoubleFeatureReco extends DoubleFeatureWork {
  /** Track titles for the J-card spine (Space Mono). */
  tracklist?: string[];
  /** Total duration label, e.g. "42 MIN". */
  duration?: string;
}

export interface DoubleFeatureData {
  /** Side A — the work the user loved (the seed). */
  seed: DoubleFeatureWork;
  /** Side B — the cross-media recommendation. */
  reco: DoubleFeatureReco;
  /**
   * 4–6 dominant hex colors extracted on-device (palette.ts). Drives both
   * generative discs + the auras. Colors are not protectable expression
   * (ADR-008): this is the only bridge from cover art to the card.
   */
  palette: string[];
  /**
   * Each cover's own palette, when the caller has them apart (the share in
   * cross-media-discovery.tsx does). The card paints each work as the no-art
   * recipe of ITS palette; without this it splits `palette` in halves.
   */
  palettes?: { seed: string[]; reco: string[] };
  /**
   * The hero narrative — the "why this pairing" line, LLM-authored and
   * grounded. Optional overrides let the caller localize each fragment.
   */
  narrative: {
    /** Mono eyebrow over the hook, e.g. "viste F1 hasta la última vuelta" — what you watched, never a rating (Kura has none). */
    hookEyebrow: string;
    /** The hook headline (Newsreader), e.g. "Así que fuimos a buscar quién le puso voz…". */
    hookTitle: string;
    /** Mono eyebrow over the result, e.g. "y dimos con tu próxima obsesión". */
    resultEyebrow: string;
    /** Optional closing serif line, e.g. "No la vas a soltar — lo sabemos.". */
    closer?: string;
  };
  /** The sharer's handle — printed as @handle on the card's foot. */
  username: string;
  /** Sequential edition number for the header, e.g. 14 → "Nº 014". */
  edition?: number;
  /**
   * F3.5.8 honesty label: "factual" = the pairing narrates a VERIFIED link
   * (soundtrack/score edge from the graph); "thematic" = the deep-cut path
   * (an honest vibe, not a checked fact). Omitted → no label (legacy callers).
   */
  linkKind?: "factual" | "thematic";
}
