import type { MediaType } from "@/modules/catalog/types";

/**
 * A title that hasn't come out yet ("no puedo esperar"): what the automatic
 * collection (backlogs/collection-cards.tsx), the profile's wait strip and
 * Música's "próximos discos" draw, each wearing the countdown pill
 * (`releaseLabel`).
 *
 * NOTHING here is user-activated: an item enters and leaves by its own date.
 *
 * Only the TYPE lives here now — the `UpcomingShelf` section component had no
 * users left and was removed (2026-10-01). The file keeps its path because
 * `src/modules/backlog/{library,follow-suggestion}.ts` import the type from it.
 */
export interface UpcomingItem {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  /** ISO string — always in the future for anything in this list. */
  releaseDate: string;
}
