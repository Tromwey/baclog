import type { CardBacklog, CardItem, CardStyle } from "../types";
import { drawCollection } from "./collection";
import { drawPattern } from "./pattern";
import { drawTitleCard } from "./title";

export { CARD_HEIGHT, CARD_WIDTH } from "../types";
export { CARD_FONTS } from "./fonts";
export { drawDoubleFeature } from "./double-feature";

/**
 * Invariant: `item` must be a real item (the title card renders a single
 * one). The exporters never offer a card for an empty collection.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  style: CardStyle,
  backlog: CardBacklog,
  item: CardItem,
) {
  switch (style) {
    case "title":
      drawTitleCard(ctx, backlog, item);
      break;
    case "pattern":
      drawPattern(ctx, backlog);
      break;
    case "collection":
      drawCollection(ctx, backlog);
      break;
  }
}
