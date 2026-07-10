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
  items: BacklogItemWithCatalog[],
): CardBacklog {
  return {
    name: backlogName,
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
        // Two independent axes → one card glyph (F3.7): obsession (★★) outranks
        // a verdict (★ liked / nothing for disliked, via reactionGlyph).
        reaction: i.obsessed ? "obsessed" : (i.verdict ?? undefined),
      }),
    ),
  };
}
