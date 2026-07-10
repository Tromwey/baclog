import {
  CARD_HEIGHT,
  CARD_WIDTH,
  STATUS_LABEL,
  TYPE_LABEL,
  type CardBacklog,
} from "../types";
import { MONO } from "./fonts";
import {
  CARD_TOKENS,
  drawGrain,
  footerUrl,
  hashString,
  mulberry32,
  reactionGlyph,
  truncateToWidth,
} from "./util";

// sistema-diseno §5 — "papel negro --bg, tinta off-white". Black receipt
// paper, warm off-white ink; the toothed edge & grain keep it analog.
const PAPER = CARD_TOKENS.bg; // #0B0B0D
const INK = CARD_TOKENS.text; // #F4F3EE
const INK_SOFT = CARD_TOKENS.text3; // #6C6B76
const EDGE = "#050506"; // slightly darker than paper, for the toothed border
// Vertical budget: items must end by y≈1470 so the fixed barcode/footer zone never collides
const MAX_ITEMS = 6;
const ITEM_STEP = 124;
const BARCODE_TOP = 1560;

function zigzagEdge(
  ctx: CanvasRenderingContext2D,
  y: number,
  pointUp: boolean,
) {
  const tooth = 36;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x <= CARD_WIDTH; x += tooth) {
    ctx.lineTo(x + tooth / 2, y + (pointUp ? -tooth / 2 : tooth / 2));
    ctx.lineTo(x + tooth, y);
  }
  ctx.lineTo(CARD_WIDTH, pointUp ? y + tooth : y - tooth);
  ctx.lineTo(0, pointUp ? y + tooth : y - tooth);
  ctx.closePath();
  ctx.fillStyle = EDGE;
  ctx.fill();
}

function dashedRule(ctx: CanvasRenderingContext2D, y: number, pad: number) {
  ctx.save();
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(CARD_WIDTH - pad, y);
  ctx.stroke();
  ctx.restore();
}

export function drawReceipt(
  ctx: CanvasRenderingContext2D,
  backlog: CardBacklog,
) {
  const pad = 96;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  zigzagEdge(ctx, 0, false);
  zigzagEdge(ctx, CARD_HEIGHT, true);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = MONO(46, true);
  ctx.fillText("*  B A C L O G  *", CARD_WIDTH / 2, 240);

  ctx.font = MONO(72, true);
  ctx.fillText(
    truncateToWidth(ctx, backlog.name.toUpperCase(), CARD_WIDTH - pad * 2),
    CARD_WIDTH / 2,
    360,
  );

  const date = new Date()
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase();
  ctx.font = MONO(36);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(`${date} · ${backlog.items.length} ITEMS`, CARD_WIDTH / 2, 430);

  dashedRule(ctx, 500, pad);

  ctx.textAlign = "left";
  let y = 572;
  const shown =
    backlog.items.length > MAX_ITEMS
      ? backlog.items.slice(0, MAX_ITEMS - 1)
      : backlog.items;
  for (const item of shown) {
    ctx.fillStyle = INK;
    ctx.font = MONO(44, true);
    ctx.fillText(
      truncateToWidth(ctx, item.title.toUpperCase(), CARD_WIDTH - pad * 2),
      pad,
      y,
    );

    ctx.fillStyle = INK_SOFT;
    ctx.font = MONO(34);
    const glyph = reactionGlyph(item.reaction);
    const reaction = glyph ? `  ${glyph}` : "";
    ctx.fillText(
      `  ${TYPE_LABEL[item.type]} · ${STATUS_LABEL[item.status].toUpperCase()}${reaction}`,
      pad,
      y + 52,
    );
    y += ITEM_STEP;
  }
  if (shown.length < backlog.items.length) {
    ctx.fillStyle = INK;
    ctx.font = MONO(40, true);
    ctx.fillText(`+ ${backlog.items.length - shown.length} MORE`, pad, y);
    y += 100;
  }

  dashedRule(ctx, y + 10, pad);

  ctx.font = MONO(42, true);
  ctx.fillStyle = INK;
  const total = `${backlog.items.length} OBSESSIONS`;
  const label = "TOTAL";
  const dotsWidth =
    CARD_WIDTH - pad * 2 - ctx.measureText(label).width - ctx.measureText(total).width - 40;
  const dotCount = Math.max(2, Math.floor(dotsWidth / ctx.measureText(".").width));
  ctx.fillText(label, pad, y + 110);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(".".repeat(dotCount), pad + ctx.measureText(label).width + 20, y + 110);
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(total, CARD_WIDTH - pad, y + 110);
  ctx.textAlign = "left";

  dashedRule(ctx, y + 180, pad);

  // Pseudo-barcode: deterministic bars seeded by backlog name — own IP, no scannable data
  const rand = mulberry32(hashString(backlog.name));
  let x = pad + 40;
  ctx.fillStyle = INK;
  while (x < CARD_WIDTH - pad - 40) {
    const w = 6 + Math.floor(rand() * 4) * 8;
    if (rand() > 0.35) ctx.fillRect(x, BARCODE_TOP, w, 110);
    x += w + 10;
  }

  // Watermark — always bottom-center (sistema-diseno §5)
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = MONO(40, true);
  ctx.fillText(footerUrl(backlog.username), CARD_WIDTH / 2, CARD_HEIGHT - 180);
  ctx.font = MONO(30);
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("THANK YOU FOR OBSESSING WITH US", CARD_WIDTH / 2, CARD_HEIGHT - 120);

  drawGrain(ctx, CARD_WIDTH, CARD_HEIGHT, 0.05, hashString(backlog.name));
}
