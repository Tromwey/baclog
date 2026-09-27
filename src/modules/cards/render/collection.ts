import { tintEnds } from "@/components/kura/tint";
import { CARD_HEIGHT, CARD_WIDTH, type CardBacklog, type CardItem } from "../types";
import { NEWS, RHMONO } from "./fonts";
import { truncateToWidth, wrapText } from "./util";

/**
 * The collection's 9:16 card (Colecciones formalizado · 4b, replaces the
 * receipt at /backlogs/[id]/card): the collection's fan on its feed
 * gradient, the name in Newsreader, the line in italic, and a dashed foot
 * with the count and the @handle, signed "kura". Drawn at 1080×1920 from the
 * 300×533 frame (× 3.6).
 *
 * ADR-008: the PNG can't carry artwork — `CardItem` has no image field — so
 * each cover of the fan is its PALETTE printed as the app's no-art recipe
 * (a 160° gradient between its two tones with a soft highlight), at its
 * native form (póster 2:3, disco 1:1). The fan is `items[0..2]` in the order
 * the caller passes them (the chosen cover first — see the card page).
 */

const X = 3.6;
const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";
const EMPTY = "#141417";

/** The fan geometry at lead = 225 (components/kura/fan.tsx), on 300 × 243. */
const FAN = {
  w: 300,
  lead: { cx: 150, cy: 112.5, poster: [150, 225], album: [180, 180] },
  left: { cx: 69.5, cy: 126, rot: -10 },
  right: { cx: 231.5, cy: 126.5, rot: 9 },
  back: { poster: [117, 176], album: [135, 135] },
} as const;

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One cover of the fan: its palette as the no-art recipe, rotated on its centre. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  item: CardItem | undefined,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
  radius: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rot * Math.PI) / 180);
  const x = -w / 2;
  const y = -h / 2;

  // Depth: the system's cover shadow (0 18 36 -16, .88), as close as canvas gets.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 90;
  ctx.shadowOffsetY = 50;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = EMPTY;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const a = item?.palette?.[0];
  const b = item?.palette?.[1] ?? a;
  if (a && b) {
    // linear-gradient(160deg, a, b): 160° from "up", clockwise.
    const t = ((160 - 90) * Math.PI) / 180;
    const half = (Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))) / 2;
    const g = ctx.createLinearGradient(-Math.cos(t) * half, -Math.sin(t) * half, Math.cos(t) * half, Math.sin(t) * half);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // radial-gradient(90% 70% at 30% 20%, a .55 → 0 at 70%)
    const hx = x + w * 0.3;
    const hy = y + h * 0.2;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(0.9 * w, 0.7 * h);
    const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.7);
    r.addColorStop(0, rgba(a, 0.55));
    r.addColorStop(1, rgba(a, 0));
    ctx.fillStyle = r;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  } else {
    ctx.fillStyle = EMPTY;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function drawFan(ctx: CanvasRenderingContext2D, items: CardItem[], left: number, top: number, s: number) {
  // The floor shadow under the front cover.
  const floorW = 174 * s;
  const floorH = 24 * s;
  const fx = left + (FAN.w * s) / 2;
  const fy = top + 243 * s - floorH / 2;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(floorW / 2, floorH / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "rgba(0,0,0,.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  const radius = 14 * X;
  const slots = [
    { item: items[1], at: FAN.left, front: false, fallbackAlbum: false },
    { item: items[2], at: FAN.right, front: false, fallbackAlbum: true },
    { item: items[0], at: FAN.lead, front: true, fallbackAlbum: false },
  ];
  for (const { item, at, front, fallbackAlbum } of slots) {
    const album = item ? item.type === "album" : fallbackAlbum;
    const [w, h] = front
      ? album
        ? FAN.lead.album
        : FAN.lead.poster
      : album
        ? FAN.back.album
        : FAN.back.poster;
    const rot = "rot" in at ? at.rot : 0;
    drawCover(ctx, item, left + at.cx * s, top + at.cy * s, w * s, h * s, rot, radius);
  }
}

function drawCentered(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.fillText(text, CARD_WIDTH / 2, y);
}

/** Letter-spacing for the mono voice (+8%), where the canvas supports it. */
function track(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

export function drawCollection(ctx: CanvasRenderingContext2D, backlog: CardBacklog) {
  const lead = backlog.items.find((i) => i.palette?.length)?.palette ?? [];
  const [top, bottom] = tintEnds(lead);

  // Background: the feed card's 168° between the two ends.
  ctx.save();
  const t = ((168 - 90) * Math.PI) / 180;
  const half = (Math.abs(CARD_WIDTH * Math.cos(t)) + Math.abs(CARD_HEIGHT * Math.sin(t))) / 2;
  const bg = ctx.createLinearGradient(
    CARD_WIDTH / 2 - Math.cos(t) * half,
    CARD_HEIGHT / 2 - Math.sin(t) * half,
    CARD_WIDTH / 2 + Math.cos(t) * half,
    CARD_HEIGHT / 2 + Math.sin(t) * half,
  );
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.restore();

  const padX = 24 * X;
  const padY = 26 * X;
  const inner = CARD_WIDTH - padX * 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Eyebrow.
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(9 * X);
  track(ctx, 9 * X * 0.08);
  drawCentered(ctx, "KURA · COLECCIÓN", padY);
  track(ctx, 0);

  // The fan: lead 177 on the 300 frame (250 × 195 box, 26 below the eyebrow).
  const s = (177 / 225) * X;
  const fanTop = padY + 12 * X + 26 * X;
  drawFan(ctx, backlog.items.slice(0, 3), CARD_WIDTH / 2 - (FAN.w * s) / 2, fanTop, s);

  // Name (Newsreader 32, up to two lines) and the line (italic 15).
  let y = fanTop + 195 * X + 18 * X;
  ctx.fillStyle = TEXT;
  let size = 32 * X;
  ctx.font = NEWS(size);
  let lines = wrapText(ctx, backlog.name, inner);
  if (lines.length > 2) {
    size = 26 * X;
    ctx.font = NEWS(size);
    lines = wrapText(ctx, backlog.name, inner).slice(0, 2);
  }
  for (const line of lines) {
    drawCentered(ctx, line, y);
    y += size * 1.05;
  }
  if (backlog.vibe) {
    y += 8 * X - size * 0.05;
    ctx.fillStyle = TEXT_2;
    ctx.font = NEWS(15 * X, true);
    const vibe = wrapText(ctx, backlog.vibe, inner).slice(0, 2);
    for (const line of vibe) {
      drawCentered(ctx, line, y);
      y += 15 * X * 1.3;
    }
  }

  // Foot: the dashed rule, "12 títulos" · "@sofi", and the wordmark.
  const wordSize = 18 * X;
  const wordY = CARD_HEIGHT - padY - wordSize;
  const rowY = wordY - 10 * X - 9 * X * 1.2;
  const ruleY = rowY - 12 * X;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = X;
  ctx.setLineDash([4 * X, 3 * X]);
  ctx.beginPath();
  ctx.moveTo(padX, ruleY);
  ctx.lineTo(CARD_WIDTH - padX, ruleY);
  ctx.stroke();
  ctx.restore();

  const n = backlog.items.length;
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(9 * X);
  track(ctx, 9 * X * 0.08);
  ctx.textAlign = "left";
  ctx.fillText(`${n} ${n === 1 ? "TÍTULO" : "TÍTULOS"}`, padX, rowY);
  if (backlog.username) {
    ctx.textAlign = "right";
    ctx.fillText(truncateToWidth(ctx, `@${backlog.username}`, inner / 2), CARD_WIDTH - padX, rowY);
  }
  track(ctx, 0);

  ctx.textAlign = "center";
  ctx.fillStyle = TEXT;
  ctx.font = NEWS(wordSize, true, 500);
  drawCentered(ctx, "kura", wordY);
}
