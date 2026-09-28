import { BOOKMARK_PATH, CHECK_FILL_PATH, FLAME_PATH, REVIEW_PATH } from "@/components/glyph-paths";
import { monthName, shortYear } from "@/modules/backlog/recap-format";
import { CARD_HEIGHT, CARD_WIDTH, type CardBacklog, type RecapCardData } from "../types";
import { cardFoot, drawLockup, track } from "./brand";
import { FAN, drawFan, drawSurface } from "./collection";
import { NEWS, RHMONO } from "./fonts";
import { ST } from "./title";
import { truncateToWidth } from "./util";

/**
 * The monthly recap's card (`/recap/tarjeta`, flujo 10 · "Tarjeta"): the
 * month as the recap screen shows it, on the same 300×533 frame × 3.6 as the
 * title and collection cards — replaces the Baclog generative field (HSL
 * shapes, grain, dark bands; founder 2026-09-28).
 *
 *   "RECAP" in mono — no date, the title already says it — (the card keeps the context the app dropped:
 *   it travels outside Kura) · "septiembre ’26" in Newsreader roman with the
 *   short year smaller in text-2 (`RecapMonthTitle` / the web h1) · the fan
 *   of the month with "lo más tuyo" in front (flujo 10 draws three covers,
 *   the top one in the middle; iOS `RecapPayload.fan` is the same) · the
 *   month's numbers in mono with their glyph, only the ones that aren't 0 ·
 *   a dashed foot with "N TÍTULOS" · @handle and the 蔵 kura lockup.
 *
 * The surface is the top title's palette as the 168° tint — the recap
 * screen's own surface; no palette → `--bg`. Covers are palettes as the
 * no-art recipe at their native form (ADR-008: `CardItem` has no image).
 */

const X = 3.6;
const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";

/** The month's numbers in the recap's order (`RecapStats`, iOS `tiles`). */
function recapStats(r: RecapCardData) {
  return [
    { v: r.completed, one: "COMPLETO", many: "COMPLETOS", d: CHECK_FILL_PATH, c: ST.completed },
    { v: r.obsessions, one: "OBSESIÓN", many: "OBSESIONES", d: FLAME_PATH, c: ST.obsessed },
    { v: r.reviews, one: "RESEÑA", many: "RESEÑAS", d: REVIEW_PATH, c: TEXT },
    { v: r.saved, one: "GUARDADO", many: "GUARDADOS", d: BOOKMARK_PATH, c: TEXT_2 },
  ].filter((s) => s.v > 0);
}

const NUM = 30 * X;
const LABEL = 9 * X;
const GLYPH = 10 * X;
const CELL_GAP = 7 * X;
const CELL_H = NUM + CELL_GAP + LABEL * 1.2;
const ROW_GAP = 18 * X;

export function drawRecap(ctx: CanvasRenderingContext2D, backlog: CardBacklog) {
  const r = backlog.recap;
  const items = backlog.items;
  drawSurface(ctx, items[0]?.palette ?? []);

  const padX = 24 * X;
  const padY = 26 * X;
  const inner = CARD_WIDTH - padX * 2;
  const cx = CARD_WIDTH / 2;
  const monoSize = 9 * X;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Eyebrow: what it is and when ("recap 08.2026" in flujo 10's spine).
  if (r) {
    ctx.fillStyle = TEXT_2;
    ctx.font = RHMONO(monoSize);
    track(ctx, monoSize * 0.08);
    // Only "RECAP": the month and year already live in the title (founder, 2026-09-28).
    ctx.fillText("RECAP", cx, padY);
    track(ctx, 0);
  }

  const { markSize, markCy, rowY, ruleY } = cardFoot(CARD_HEIGHT, padY, X, monoSize * 1.2);

  // The block: title · fan · numbers, centred between the eyebrow and the rule.
  const stats = r ? recapStats(r) : [];
  const cols = stats.length <= 3 ? stats.length : 2;
  const rows = cols ? Math.ceil(stats.length / cols) : 0;
  const statsH = rows ? rows * CELL_H + (rows - 1) * ROW_GAP : 0;

  // Title: "septiembre ’26" — the year at 0.56 in text-2, one line, shrunk to fit.
  const month = r ? monthName(r.eraKey) : backlog.name;
  const year = r ? ` ${shortYear(r.eraKey)}` : "";
  let titleSize = 46 * X;
  const measure = () => {
    ctx.font = NEWS(titleSize);
    const mw = ctx.measureText(month).width;
    ctx.font = NEWS(titleSize * 0.56);
    return { mw, yw: year ? ctx.measureText(year).width : 0 };
  };
  let { mw, yw } = measure();
  if (mw + yw > inner) {
    titleSize *= inner / (mw + yw);
    ({ mw, yw } = measure());
  }
  const titleH = titleSize * 0.96;

  const gapTitle = 24 * X;
  const gapStats = 30 * X;
  const areaTop = padY + monoSize * 1.2 + 22 * X;
  const areaBottom = ruleY - 22 * X;
  const room = areaBottom - areaTop - titleH - gapTitle - (statsH ? gapStats + statsH : 0);
  // The fan's box is ≈ its lead tall (lead 225 → 300 × 225) — capped by the
  // frame's width (250 of 252) and by what's left of the height.
  const lead = Math.max(120, Math.min(187, room / X));
  const s = (lead / 225) * X;
  const fanH = lead * X;
  const blockH = titleH + gapTitle + fanH + (statsH ? gapStats + statsH : 0);
  let y = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const baseline = y + titleSize * 0.78;
  const left = cx - (mw + yw) / 2;
  ctx.fillStyle = TEXT;
  ctx.font = NEWS(titleSize);
  ctx.fillText(truncateToWidth(ctx, month, inner), left, baseline);
  if (year) {
    ctx.fillStyle = TEXT_2;
    ctx.font = NEWS(titleSize * 0.56);
    ctx.fillText(year, left + mw, baseline);
  }
  y += titleH + gapTitle;

  drawFan(ctx, items.slice(0, 3), cx - (FAN.w * s) / 2, y, s);
  y += fanH + gapStats;

  // The numbers: one row of up to three, or a 2×2 (the recap's own grid).
  const cellW = cols ? inner / cols : 0;
  stats.forEach((st, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // A lone last cell (3 of a 2×2 can't happen: 3 → one row) stays in its column.
    const ccx = padX + cellW * (col + 0.5);
    const top = y + row * (CELL_H + ROW_GAP);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = TEXT;
    ctx.font = RHMONO(NUM);
    ctx.fillText(String(st.v), ccx, top);

    const label = st.v === 1 ? st.one : st.many;
    ctx.font = RHMONO(LABEL);
    track(ctx, LABEL * 0.08);
    const lw = ctx.measureText(label).width;
    const gap = 5 * X;
    const lx = ccx - (GLYPH + gap + lw) / 2;
    const ly = top + NUM + CELL_GAP;
    ctx.save();
    ctx.translate(lx, ly + (LABEL * 1.2 - GLYPH) / 2);
    ctx.scale(GLYPH / 24, GLYPH / 24);
    ctx.fillStyle = st.c;
    ctx.fill(new Path2D(st.d));
    ctx.restore();
    ctx.fillStyle = TEXT_2;
    ctx.textAlign = "left";
    ctx.fillText(label, lx + GLYPH + gap, ly + LABEL * 0.1);
    track(ctx, 0);
  });

  // Foot: the dashed rule, "N TÍTULOS" · "@sofi", and the 蔵 kura lockup (`cardFoot`).
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = X;
  ctx.setLineDash([4 * X, 3 * X]);
  ctx.beginPath();
  ctx.moveTo(padX, ruleY);
  ctx.lineTo(CARD_WIDTH - padX, ruleY);
  ctx.stroke();
  ctx.restore();

  const n = items.length;
  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(monoSize);
  track(ctx, monoSize * 0.08);
  ctx.textAlign = "left";
  ctx.fillText(`${n} ${n === 1 ? "TÍTULO" : "TÍTULOS"}`, padX, rowY);
  if (backlog.username) {
    ctx.textAlign = "right";
    ctx.fillText(truncateToWidth(ctx, `@${backlog.username}`, inner / 2), CARD_WIDTH - padX, rowY);
  }
  track(ctx, 0);

  drawLockup(ctx, cx, markCy, markSize, "center", TEXT);
}
