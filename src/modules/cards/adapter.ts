import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";
import type { CardBacklog, CardItem, ItemStatus } from "./types";

const STATUS_MAP: Record<string, ItemStatus> = {
  on_my_radar: "on-my-radar",
  obsessing_over: "obsessing-over",
  completed: "completed",
  // Custom statuses render their own label via statusLabelOverride
  custom: "obsessing-over",
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
        statusLabelOverride:
          i.status === "custom"
            ? (i.customStatusLabel ?? undefined)
            : undefined,
        rating: i.rating ?? undefined,
      }),
    ),
  };
}
