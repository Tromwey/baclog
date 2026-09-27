import type { MediaType } from "@/modules/catalog/types";
import type { FanCover } from "./fan";

/**
 * One title of a collection as the collection's body draws it (Colecciones ·
 * una sola página, 2026-09-27): the same shape on Tus colecciones (10a) and
 * the collection (10b), so both mount the same body. Server-safe (types
 * only): `shelves.ts` builds it on the server, the client body reads it.
 */
export interface CollectionItem {
  /** The membership (`backlog_item.id`) — what Quitar / Mover act on. */
  backlogItemId: string;
  catalogItemId: string;
  title: string;
  byline: string | null;
  mediaType: MediaType;
  year: number | null;
  posterUrl: string | null;
  paletteHex: string[] | null;
  status: string;
  verdict: "liked" | "disliked" | null;
  obsessed: boolean;
  /** ISO or null. */
  releaseDate: string | null;
  /** ISO — when it entered THIS collection. */
  addedAt: string;
}

/** Another collection of the owner, as the Mover a rows draw it (7a). */
export interface OtherCollection {
  id: string;
  name: string;
  fan: FanCover[];
  count: number;
}
