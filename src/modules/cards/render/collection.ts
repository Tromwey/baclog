import { tintEnds } from "@/components/kura/tint";
import { CARD_HEIGHT, CARD_WIDTH, type CardBacklog, type CardItem } from "../types";
import { drawLockup, track } from "./brand";
import { NEWS, RHMONO } from "./fonts";
import { truncateToWidth, wrapText } from "./util";

/**
 * The collection's 9:16 card (Colecciones formalizado · 4b, replaces the
 * receipt at /backlogs/[id]/card): the collection's fan on its feed
 * gradient, the name in Newsreader, the line in italic, and a dashed foot
 * with the count and the @handle, signed with the 蔵 kura lockup. Drawn at 1080×1920 from the
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

/**
 * One cover: its palette as the no-art recipe, rotated on its centre, with
 * the system's cover shadow. Shared with the title card (title.ts).
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  item: Pick<CardItem, "palette"> | undefined,
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
  // No floor shadow: each cover carries its own (founder, 2026-09-27 — same as `Fan`).
  const radius = 14 * X;
  const slots = [
    { item: items[1], at: FAN.left, front: false, fallbackAlbum: false },
    { item: items[2], at: FAN.right, front: false, fallbackAlbum: true },
    { item: items[0], at: FAN.lead, front: true, fallbackAlbum: false },
  ];
  for (const { item, at, front, fallbackAlbum } of slots) {
    // Abanico corto: with 1–2 titles only those are drawn — no empty back slots (same as `Fan`).
    if (!item && !front && items.length > 0) continue;
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

  // Eyebrow — the brand signs the foot, so the top only names the object
  // (and "KURA" in caps broke the lowercase mark — voz · regla 12).
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(9 * X);
  track(ctx, 9 * X * 0.08);
  drawCentered(ctx, "COLECCIÓN", padY);
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

  // Foot: the dashed rule, "12 títulos" · "@sofi", and the 蔵 kura lockup
  // (§marca · C: the kanji is twice the wordmark, so the lockup is 2 × markSize tall).
  const markSize = 14 * X;
  const markCy = CARD_HEIGHT - padY - markSize;
  const rowY = markCy - markSize - 10 * X - 9 * X * 1.2;
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

  drawLockup(ctx, CARD_WIDTH / 2, markCy, markSize, "center", TEXT);
}
