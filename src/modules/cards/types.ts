export type MediaType = "film" | "series" | "album";

export type ItemStatus = "on-my-radar" | "obsessing-over" | "completed";

export interface CardItem {
  title: string;
  /** Artist for music, studio/network for film & series */
  byline: string;
  type: MediaType;
  year: number;
  genre: string;
  mood: string;
  status: ItemStatus;
  /** Custom user status label (F2.8) — renderers prefer it over STATUS_LABEL */
  statusLabelOverride?: string;
  /** 1–5, only meaningful when status is "completed" */
  rating?: number;
}

export interface CardBacklog {
  name: string;
  username: string;
  items: CardItem[];
}

export type CardStyle = "receipt" | "ticket" | "pattern";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export const STATUS_LABEL: Record<ItemStatus, string> = {
  "on-my-radar": "ON MY RADAR",
  "obsessing-over": "OBSESSING OVER",
  completed: "COMPLETED",
};

export const TYPE_LABEL: Record<MediaType, string> = {
  film: "FILM",
  series: "SERIES",
  album: "ALBUM",
};
