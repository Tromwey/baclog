import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";
import type { CardBacklog, CardItem, ItemStatus } from "./types";

const STATUS_MAP: Record<string, ItemStatus> = {
  on_my_radar: "on-my-radar",
  in_progress: "in-progress",
  completed: "completed",
  // F2.8 'custom' is retired; a stray legacy value falls back to on-my-radar.
};

/**
 * Maps real backlog rows onto the M1 card contract. The renderers are
 * structurally incapable of drawing artwork: CardItem has no image field
 * (ADR-008 enforced by shape, not by discipline).
 */
export function toCardBacklog(
  backlogName: string,
  vibe: string | null,
  username: string | null,
  // The ficha's entry also carries `releaseDate` (the "no puedo esperar"
  // pill); collection rows don't need it.
  items: (BacklogItemWithCatalog & { releaseDate?: Date | null })[],
): CardBacklog {
  return {
    name: backlogName,
    ...(vibe ? { vibe } : {}),
    username: username ?? "",
    items: items.map(
      (i): CardItem => ({
        title: i.title,
        byline: i.byline ?? "",
        type: i.mediaType,
        year: i.year ?? new Date().getFullYear(),
        genre: i.genre ?? "misc",
        mood: vibe ?? i.genre ?? "vibe",
        status: STATUS_MAP[i.status] ?? "on-my-radar",
        // Two independent axes → one reaction (F3.7): obsession outranks a
        // verdict; "disliked" rides along but no card prints it (voz · 11).
        reaction: i.obsessed ? "obsessed" : (i.verdict ?? undefined),
        // Cover palette (shared catalog_item) tints the card; null when
        // unextracted → the neutral surface.
        palette: i.paletteHex ?? undefined,
        ...(i.releaseDate ? { releaseDate: i.releaseDate.toISOString() } : {}),
      }),
    ),
  };
}
