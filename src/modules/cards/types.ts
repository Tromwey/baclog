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
  /** Single card glyph derived from the two axes (F3.7): obsessed → ★★, liked → ★. */
  reaction?: ItemReaction;
}

export interface CardBacklog {
  name: string;
  username: string;
  items: CardItem[];
}

export type CardStyle = "receipt" | "ticket" | "pattern";

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
   * The hero narrative — the "why this pairing" line, LLM-authored and
   * grounded. Optional overrides let the caller localize each fragment.
   */
  narrative: {
    /** Small lima eyebrow over the hook, e.g. "viste F1 hasta la última vuelta · ★★★★★". */
    hookEyebrow: string;
    /** The hook headline (Bricolage), e.g. "Así que fuimos a buscar quién le puso voz…". */
    hookTitle: string;
    /** Lima eyebrow over the result, e.g. "y dimos con tu próxima obsesión". */
    resultEyebrow: string;
    /** Optional closing serif line, e.g. "No la vas a soltar — lo sabemos.". */
    closer?: string;
  };
  /** Watermark handle — renders as baclog.app/{username}. */
  username: string;
  /** Sequential edition number for the header, e.g. 14 → "Nº 014". */
  edition?: number;
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  "on-my-radar": "ON MY RADAR",
  "in-progress": "IN PROGRESS",
  completed: "COMPLETED",
};

export const TYPE_LABEL: Record<MediaType, string> = {
  film: "FILM",
  series: "SERIES",
  album: "ALBUM",
};
