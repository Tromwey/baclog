import type { CardBacklog, CardItem, CardStyle } from "../types";
import { drawPattern } from "./pattern";
import { drawReceipt } from "./receipt";
import { drawTicket } from "./ticket";

export { CARD_HEIGHT, CARD_WIDTH } from "../types";

export const CARD_FONTS = [
  '700 16px "Space Mono"',
  '400 16px "Space Mono"',
  '700 16px "Oswald"',
  '400 16px "Archivo Black"',
];

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
