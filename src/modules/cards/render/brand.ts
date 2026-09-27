import { KANJI, NEWS } from "./fonts";

/** Letter-spacing on the canvas, where supported (Chrome/Safari 17+). */
export function track(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

/**
 * The Kura lockup on a shareable image — sistema-de-diseno §marca · C "con
 * kanji", the one meant for brand material: 蔵 in a serif JP at 700 and TWICE
 * the wordmark's size, a 20/48 gap, then "kura" in Newsreader italic 500 at
 * −0.03 em, the two centred on one line. Always lowercase (voz · regla 12).
 *
 * Images are brand material that leaves the app, so their mark is C — never
 * A or B beside it ("no combinar A y B en la misma pieza"). The kura keeps
 * A's minimum of 24 px tall: `size` ≥ 34 at export scale (the k is 0.714 em).
 * Today: title/collection/conexión 50.4, recap 42.
 *
 * `size` is the wordmark's; `x` the anchor for `align`; `cy` the line's
 * vertical centre. The kanji font ships as a single Regular glyph
 * (kanji-font.ts), so the 700 is a stroke of 0.03 em in the same ink.
 * Returns the lockup's width.
 */
export function drawLockup(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  size: number,
  align: "left" | "center" | "right",
  color: string,
) {
  const kanjiSize = size * 2;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  track(ctx, 0);
  ctx.font = KANJI(kanjiSize);
  const kanjiW = ctx.measureText("蔵").width;
  ctx.font = NEWS(size, true, 500);
  track(ctx, -0.03 * size);
  const wordW = ctx.measureText("kura").width;
  const gap = (size * 20) / 48;
  const total = kanjiW + gap + wordW;
  const left = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  ctx.fillText("kura", left + kanjiW + gap, cy);
  track(ctx, 0);
  ctx.font = KANJI(kanjiSize);
  ctx.lineJoin = "round";
  ctx.lineWidth = kanjiSize * 0.03;
  ctx.strokeText("蔵", left, cy);
  ctx.fillText("蔵", left, cy);
  ctx.restore();
  return total;
}
