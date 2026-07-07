import type { CardBacklog, CardItem, CardStyle } from "../types";
import { drawPattern } from "./pattern";
import { drawReceipt } from "./receipt";
import { drawTicket } from "./ticket";

export { CARD_HEIGHT, CARD_WIDTH } from "../types";
export { CARD_FONTS } from "./fonts";
export { drawDoubleFeature } from "./double-feature";

/**
 * Invariant: `ticketItem` must be a real item (the ticket style renders a
 * single item). M2's generator must not offer card export for empty backlogs.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  style: CardStyle,
  backlog: CardBacklog,
  ticketItem: CardItem,
) {
  switch (style) {
    case "receipt":
      drawReceipt(ctx, backlog);
      break;
    case "ticket":
      drawTicket(ctx, backlog, ticketItem);
      break;
    case "pattern":
      drawPattern(ctx, backlog);
      break;
  }
}
