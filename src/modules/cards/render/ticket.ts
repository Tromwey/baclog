import {
  CARD_HEIGHT,
  CARD_WIDTH,
  STATUS_LABEL,
  type CardBacklog,
  type CardItem,
  type MediaType,
} from "../types";
import { DISPLAY, MONO, SANS, SERIF } from "./fonts";
import {
  drawGrain,
  footerUrl,
  hashString,
  reactionGlyph,
  truncateToWidth,
  wrapText,
} from "./util";

/**
 * Per-media-type fallback color — used only when the item has no cover palette
 * to tint from (see ticketColor). Deep + muted so the cream type reads.
 */
const TICKET_FACE: Record<MediaType, string> = {
  film: "#8f3a35",
  album: "#2c3a63",
  series: "#2e5039",
};
const CREAM = "#f5ecd9";
const CREAM_SOFT = "rgba(245, 236, 217, 0.65)";

const HEX6 = /^#?[0-9a-f]{6}$/i;

/** #rrggbb → [h∈[0,360), s∈[0,1], l∈[0,1]]. */
function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * The ticket silhouette's fill from the item's striking cover hex (palette[0],
 * vividness-ranked). Keep the HUE and clamp toward DARK rather than desaturating
 * (design review): preserve most chroma (sat ≤ 0.72) but pull lightness into a
 * deep, cream-legible band (L ∈ [0.08, 0.28]) — pale covers come down, dark
 * covers stay dark. Stress-tested on a real library so covers don't converge to
 * mud, and a dark stub keeps a natural edge on light backgrounds when shared.
 */
function ticketShade(dominantHex: string): string {
  const [h, s, l] = hexToHsl(dominantHex);
  const sat = Math.min(0.72, Math.max(0.06, s));
  const light = Math.max(0.08, Math.min(0.28, l));
  return hslToHex(h, sat, light);
}

/** Palette tint when present + valid, else the per-media-type fallback. */
function ticketColor(item: CardItem): string {
  const dominant = item.palette?.[0];
  if (dominant && HEX6.test(dominant)) return ticketShade(dominant);
  return TICKET_FACE[item.type];
}

export function drawTicket(
  ctx: CanvasRenderingContext2D,
  backlog: CardBacklog,
  item: CardItem,
) {
  // Only the ticket silhouette carries color — everything around it stays
  // transparent (the export is an alpha PNG; there is NO card rectangle behind
  // the stub). clearRect replaces the old full-canvas background fill.
  const face = ticketColor(item);
  ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // The ticket fills the frame with only a slim transparent margin all around
  // (there's no background card to leave room for). Its side punch-notches are
  // cut at the very end, as transparency.
  const tx = 30;
  const ty = 30;
  const tw = CARD_WIDTH - tx * 2;
  const th = CARD_HEIGHT - ty * 2;
  // Soft dark depth shadow (design-system exempt) so the transparent sticker
  // keeps an edge on light/busy backgrounds when shared.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 36);
  ctx.fill();
  ctx.restore();

  // Perforation baseline (also where the notches cut). Placed so the stub +
  // growth watermark sit ABOVE the bottom ~15% (out of the Stories reply-bar crop).
  const perfY = ty + th - 500;

  // Top strip
  ctx.fillStyle = CREAM;
  ctx.font = MONO(40, true);
  ctx.textAlign = "left";
  ctx.fillText("ADMIT ONE", tx + 70, ty + 120);
  ctx.textAlign = "right";
  ctx.font = MONO(40);
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillText(`Nº ${item.year}`, tx + tw - 70, ty + 120);

  ctx.strokeStyle = CREAM_SOFT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tx + 70, ty + 170);
  ctx.lineTo(tx + tw - 70, ty + 170);
  ctx.stroke();

  // Main block (title + byline + reaction + stamp) is vertically CENTERED in the
  // body, between the header and the perforation. Sparse items (short title / no
  // reaction) then read as composed — symmetric air above and below — instead of
  // dumping their content at the top over a dead void.
  ctx.textAlign = "left";
  ctx.font = SERIF(146);
  const titleMax = tw - 140;
  const allLines = wrapText(ctx, item.title, titleMax);
  const lines = allLines.slice(0, 2);
  if (allLines.length > 2) {
    lines[1] = truncateToWidth(ctx, `${lines[1]} ${allLines[2]}`, titleMax);
  }
  const glyph = reactionGlyph(item.reaction);

  // Measure the block so we can center it (all in the 1080×1920 space).
  const LINE = 156;
  const BYLINE_DROP = 82; // last title baseline → byline baseline
  const GLYPH_DROP = 132; // byline baseline → glyph baseline
  const STAMP_DROP = glyph ? 152 : 120; // (glyph|byline) baseline → stamp center
  const TITLE_CAP = 108; // block top → first title baseline
  const blockH =
    TITLE_CAP +
    (lines.length - 1) * LINE +
    BYLINE_DROP +
    (glyph ? GLYPH_DROP : 0) +
    STAMP_DROP +
    66; // stamp center → stamp box bottom
  const bodyTop = ty + 215;
  const bodyBottom = perfY - 55;
  const blockTop = bodyTop + Math.max(0, (bodyBottom - bodyTop - blockH) / 2);

  // Title — Instrument Serif italic (the emotional voice)
  ctx.fillStyle = CREAM;
  let y = blockTop + TITLE_CAP;
  for (const line of lines) {
    ctx.fillText(line, tx + 70, y);
    y += LINE;
  }
  const lastTitleBaseline = y - LINE;

  // Byline
  ctx.font = SANS(50, 500);
  ctx.fillStyle = CREAM_SOFT;
  const bylineY = lastTitleBaseline + BYLINE_DROP;
  ctx.fillText(`${item.year} · ${item.byline}`, tx + 70, bylineY);

  // Reaction glyph (obsessed ★★ / liked ★ / nothing for the rest)
  let anchorY = bylineY;
  if (glyph) {
    ctx.fillStyle = CREAM;
    ctx.font = DISPLAY(92, 700);
    anchorY = bylineY + GLYPH_DROP;
    ctx.fillText(glyph, tx + 70, anchorY);
  }

  // Status stamp — rotated stroked box, like an ink stamp
  ctx.save();
  ctx.translate(tx + 90, anchorY + STAMP_DROP);
  ctx.rotate(-0.04);
  ctx.font = MONO(52, true);
  const label = STATUS_LABEL[item.status].toUpperCase();
  const w = ctx.measureText(label).width;
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 6;
  ctx.strokeRect(-30, -64, w + 60, 100);
  ctx.fillStyle = CREAM;
  ctx.fillText(label, 0, 8);
  ctx.restore();

  // Perforation
  ctx.save();
  ctx.strokeStyle = CREAM_SOFT;
  ctx.lineWidth = 5;
  ctx.setLineDash([2, 26]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx + 60, perfY);
  ctx.lineTo(tx + tw - 60, perfY);
  ctx.stroke();
  ctx.restore();

  // Watermark leads the stub (right under the tear line) — it's the growth hook,
  // so it's prominent AND clear of the Stories reply-bar crop at the very bottom.
  ctx.font = MONO(46, true);
  ctx.fillStyle = CREAM;
  ctx.textAlign = "center";
  ctx.fillText(footerUrl(backlog.username), CARD_WIDTH / 2, perfY + 90);

  // Stub details below it
  ctx.textAlign = "left";
  ctx.font = MONO(40, true);
  ctx.fillStyle = CREAM;
  ctx.fillText("SEAT: ON MY COUCH", tx + 70, perfY + 190);
  ctx.font = MONO(40);
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillText(`ROW: ${backlog.name.toUpperCase()}`, tx + 70, perfY + 250);

  // Grain, clipped to the ticket face so it never speckles the transparent area.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 36);
  ctx.clip();
  drawGrain(ctx, CARD_WIDTH, CARD_HEIGHT, 0.05, hashString(item.title));
  ctx.restore();

  // Side notches — cut LAST as transparent bites out of the ticket edges (was a
  // background-colored fill; now the background is gone, so they're erased).
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const side of [tx, tx + tw]) {
    ctx.beginPath();
    ctx.arc(side, perfY, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
