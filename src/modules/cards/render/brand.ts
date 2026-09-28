import { LOCKUP_C } from "@/components/kura/lockup-c";
import { KANJI, NEWS } from "./fonts";

/** Letter-spacing on the canvas, where supported (Chrome/Safari 17+). */
export function track(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/**
 * The Kura lockup on a shareable image — sistema-de-diseno §marca · C "con
 * kanji", the one meant for brand material, at the product proportions in
 * `LOCKUP_C` (components/kura/lockup-c.ts): 蔵 at 1.5× the wordmark, ~600
 * (the kanji font is Regular only — kanji-font.ts — so the weight is a
 * stroke of `LOCKUP_C.stroke` em in the same ink), gap 15/48, then "kura" in
 * Newsreader italic 500 at −0.03 em; 蔵's ink centred on the kura's optical
 * centre. Always lowercase (voz · regla 12).
 *
 * Images are brand material that leaves the app, so their mark is C — never
 * A or B beside it ("no combinar A y B en la misma pieza"). The kura keeps
 * A's minimum of 24 px tall: `size` ≥ 34 at export scale (the k is 0.714 em).
 * Today every card signs at 36 (≈ 36 px of lockup, 蔵's ink ≈ 49): discreet.
 *
 * `size` is the wordmark's; `x` the anchor for `align`; `cy` the lockup's
 * optical centre line. Returns the lockup's width.
 */
export function drawLockup(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  size: number,
  align: "left" | "center" | "right",
  color: string,
) {
  const kanjiSize = size * LOCKUP_C.kanji;
  const baseline = cy + size * LOCKUP_C.center;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  track(ctx, 0);
  ctx.font = KANJI(kanjiSize);
  const kanjiW = ctx.measureText("蔵").width;
  ctx.font = NEWS(size, true, 500);
  track(ctx, -0.03 * size);
  const wordW = ctx.measureText("kura").width;
  const gap = size * LOCKUP_C.gap;
  const total = kanjiW + gap + wordW;
  const left = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  ctx.fillText("kura", left + kanjiW + gap, baseline);
  track(ctx, 0);
  ctx.font = KANJI(kanjiSize);
  ctx.lineJoin = "round";
  ctx.lineWidth = kanjiSize * LOCKUP_C.stroke;
  const kanjiBaseline = baseline + size * LOCKUP_C.drop;
  ctx.strokeText("蔵", left, kanjiBaseline);
  ctx.fillText("蔵", left, kanjiBaseline);
  ctx.restore();
  return total;
}

/** The cards' signature: the kura at A's minimum (34 → k ≈ 24 px), so the
 *  whole lockup (蔵's ink, 0.917 em × 1.5) stands ≈ 47 px on the 1080 canvas. */
export const CARD_MARK_SIZE = 34;

/**
 * The foot every 1080×1920 card shares (title, collection, conexión), bottom
 * up: `padY` of margin, the lockup, `air` of breathing room, the mono row
 * (`monoLead` tall), 12 × `X` and the dashed rule. The air above the lockup is
 * what keeps the signature discreet — apart from the row, not stacked on it.
 */
export function cardFoot(cardHeight: number, padY: number, X: number, monoLead: number) {
  const markSize = CARD_MARK_SIZE;
  const half = (0.917 * LOCKUP_C.kanji * markSize) / 2;
  const markCy = cardHeight - padY - half;
  const rowY = markCy - half - 18 * X - monoLead;
  const ruleY = rowY - 12 * X;
  return { markSize, markCy, rowY, ruleY };
}
