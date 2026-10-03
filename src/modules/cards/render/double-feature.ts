import { tintEnds } from "@/components/kura/tint";
import { CARD_HEIGHT, CARD_WIDTH, type DoubleFeatureData, type DoubleFeatureWork } from "../types";
import { stripRating } from "@/modules/recs/hook-eyebrow";
import { cardFoot, drawLockup, track } from "./brand";
import { drawCover } from "./collection";
import { NEWS, RHMONO } from "./fonts";
import { truncateToWidth, wrapText } from "./util";

/**
 * The "una conexión" share card (Descubrir → Compartir; the file is
 * `kura-una-conexion.png`). Redrawn in Kura's language like the title card
 * (render/title.ts), same 300×533 frame × 3.6 so the cards read as one
 * family (2026-09-27 — the lima #D8FF3E, the reel/vinyl discs, Bricolage,
 * Space Mono and the grain are gone):
 *
 *   the why in mono and the hook in Newsreader · the TWO works as covers at
 *   their native form (póster 2:3, disco 1:1) leaning into each other, each
 *   with its title in Newsreader italic and "CINE · 2024" / the artist in
 *   mono · what we found in mono, the pick as "*Rosie*, de Rosé.", the
 *   F3.5.8 honesty label in mono and the closer (dropped first if it
 *   doesn't fit) · a dashed foot with "UNA CONEXIÓN"
 *   (· Nº) and the @handle · the 蔵 kura lockup (§marca · C: brand material
 *   that leaves the app, with its kura ≥ 24 px tall; the card carries no
 *   other mark, so A and B never meet).
 *
 * Surface = the 168° tint from the seed's colour (top) to the pick's
 * (bottom). ADR-008: `DoubleFeatureData` carries no image — each cover is
 * the no-art recipe of ITS palette (`palettes`, or `palette` split in two).
 */

const X = 3.6;
const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";
const RULE = "rgba(255,255,255,.18)";

const KIND: Record<string, string> = { film: "PELÍCULA", series: "SERIE", album: "ÁLBUM" };

/** Cover sizes on the 300-wide frame: two works side by side. */
const COVER = { poster: [92, 138], album: [116, 116] } as const;

const MONO_SIZE = 9 * X;
const MONO_LEAD = MONO_SIZE * 1.2;

function mono(ctx: CanvasRenderingContext2D, color = TEXT_2) {
  ctx.fillStyle = color;
  ctx.font = RHMONO(MONO_SIZE);
  track(ctx, MONO_SIZE * 0.08);
}

/** The data line under a work: an album names its artist, a film its year. */
function workLine(w: DoubleFeatureWork): string {
  const second = w.type === "album" ? w.creator : w.year != null ? String(w.year) : w.creator;
  return [KIND[w.type] ?? w.type.toUpperCase(), second].filter(Boolean).join(" · ").toUpperCase();
}

/** Each work's palette: explicit when the caller has them apart, else halves. */
function splitPalettes(data: DoubleFeatureData): [string[], string[]] {
  const hex = (xs: string[]) => xs.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
  if (data.palettes) return [hex(data.palettes.seed), hex(data.palettes.reco)];
  const all = hex(data.palette);
  const half = Math.ceil(all.length / 2);
  return [all.slice(0, half), all.slice(half)];
}

export function drawDoubleFeature(ctx: CanvasRenderingContext2D, data: DoubleFeatureData) {
  const { seed, reco, narrative, username, edition, linkKind } = data;
  const [seedPal, recoPal] = splitPalettes(data);

  // Surface: 168° from the seed's colour to the pick's (AA-capped by tintEnds).
  const ends = [seedPal[0] ?? recoPal[0], recoPal[0] ?? seedPal[0]].filter((c): c is string => !!c);
  const [top, bottom] = tintEnds(ends);
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
  const cx = CARD_WIDTH / 2;
  ctx.textBaseline = "top";

  // Foot (fixed), as on the title card: rule · "UNA CONEXIÓN · Nº 014" / @handle · lockup.
  const { markSize, markCy, rowY, ruleY } = cardFoot(CARD_HEIGHT, padY, X, MONO_LEAD);

  // ---- measure the body (top → rule) so it can be centred and fitted
  const hookSize = 19 * X;
  const hookLead = hookSize * 1.14;
  const titleSize = 17 * X;
  const titleLead = titleSize * 1.08;
  const heroSize = 24 * X;
  const heroLead = heroSize * 1.1;
  const closerSize = 14 * X;
  const closerLead = closerSize * 1.3;
  const colW = inner / 2 - 6 * X;

  ctx.font = NEWS(hookSize);
  let hook = wrapText(ctx, narrative.hookTitle, inner);
  if (hook.length > 3) hook = [...hook.slice(0, 2), truncateToWidth(ctx, hook.slice(2).join(" "), inner)];

  const titleLines = (w: DoubleFeatureWork) => {
    ctx.font = NEWS(titleSize, true);
    const lines = wrapText(ctx, w.title, colW);
    return lines.length > 2 ? [lines[0], truncateToWidth(ctx, lines.slice(1).join(" "), colW)] : lines;
  };
  const seedTitle = titleLines(seed);
  const recoTitle = titleLines(reco);

  const dims = (w: DoubleFeatureWork) => (w.type === "album" ? COVER.album : COVER.poster).map((v) => v * X);
  const [aw, ah] = dims(seed);
  const [bw, bh] = dims(reco);
  const coverBand = Math.max(ah, bh) + 8 * X; // + the lean and the stagger

  const heroTitle = reco.title;
  const heroTail = reco.creator ? `, de ${reco.creator}.` : ".";
  ctx.font = NEWS(heroSize, true);
  const heroTitleW = ctx.measureText(heroTitle).width;
  ctx.font = NEWS(heroSize);
  const heroTailW = ctx.measureText(heroTail).width;
  const heroFits = heroTitleW + heroTailW <= inner;

  ctx.font = NEWS(closerSize);
  const closer = narrative.closer ? wrapText(ctx, narrative.closer, inner).slice(0, 2) : [];

  const g = { label: 8 * X, eyebrow: 8 * X, covers: 14 * X, names: 10 * X, meta: 5 * X, result: 16 * X, hero: 8 * X, closer: 8 * X };
  const namesH = Math.max(seedTitle.length, recoTitle.length) * titleLead + g.meta + MONO_LEAD;
  const label = linkKind ? (linkKind === "factual" ? "CONEXIÓN REAL" : "MISMA VIBRA") : null;
  mono(ctx);
  const resultEyebrow = wrapText(ctx, narrative.resultEyebrow.toUpperCase(), inner).slice(0, 2);
  track(ctx, 0);
  const heroH = (heroFits ? heroLead : heroLead * 2) + (label ? g.label + MONO_LEAD : 0);
  const body = (withCloser: boolean) =>
    MONO_LEAD + g.eyebrow + hook.length * hookLead +
    g.covers + coverBand + g.names + namesH +
    g.result + resultEyebrow.length * MONO_LEAD + g.hero + heroH +
    (withCloser && closer.length ? g.closer + closer.length * closerLead : 0);

  const areaTop = padY;
  const room = ruleY - 18 * X - areaTop;
  // The closer is the first thing to go when a long hook or title needs the room.
  const withCloser = body(true) <= room;
  let y = areaTop + Math.max(0, (room - body(withCloser)) / 2);

  // ---- the why: mono eyebrow + the hook in Newsreader (roman: a sentence, not a work)
  ctx.textAlign = "center";
  mono(ctx);
  ctx.fillText(truncateToWidth(ctx, stripRating(narrative.hookEyebrow).toUpperCase(), inner), cx, y);
  track(ctx, 0);
  y += MONO_LEAD + g.eyebrow;
  ctx.fillStyle = TEXT;
  ctx.font = NEWS(hookSize);
  for (const line of hook) {
    ctx.fillText(line, cx, y);
    y += hookLead;
  }

  // ---- the two works, leaning into each other (A a touch higher, B in front)
  y += g.covers;
  const bandMid = y + coverBand / 2;
  const colA = cx - inner / 4;
  const colB = cx + inner / 4;
  const radius = 12 * X;
  drawCover(ctx, { palette: seedPal }, colA + 4 * X, bandMid - 4 * X, aw, ah, -4, radius);
  drawCover(ctx, { palette: recoPal }, colB - 4 * X, bandMid + 4 * X, bw, bh, 4, radius);
  y += coverBand + g.names;

  const names = (w: DoubleFeatureWork, lines: string[], x: number) => {
    let ly = y;
    ctx.textAlign = "center";
    ctx.fillStyle = TEXT;
    ctx.font = NEWS(titleSize, true);
    track(ctx, 0);
    for (const line of lines) {
      ctx.fillText(line, x, ly);
      ly += titleLead;
    }
    ly += g.meta;
    mono(ctx);
    ctx.fillText(truncateToWidth(ctx, workLine(w), colW), x, ly);
    track(ctx, 0);
  };
  names(seed, seedTitle, colA);
  names(reco, recoTitle, colB);
  y += namesH + g.result;

  // ---- what we found: mono eyebrow, the pick, the F3.5.8 honesty label, the closer
  ctx.textAlign = "center";
  mono(ctx);
  for (const line of resultEyebrow) {
    ctx.fillText(line, cx, y);
    y += MONO_LEAD;
  }
  track(ctx, 0);
  y += g.hero;

  // "*Rosie*, de Rosé." — the work in italic, the rest roman.
  ctx.fillStyle = TEXT;
  if (heroFits) {
    const left = cx - (heroTitleW + heroTailW) / 2;
    ctx.textAlign = "left";
    ctx.font = NEWS(heroSize, true);
    ctx.fillText(heroTitle, left, y);
    ctx.font = NEWS(heroSize);
    ctx.fillText(heroTail, left + heroTitleW, y);
  } else {
    ctx.textAlign = "center";
    ctx.font = NEWS(heroSize, true);
    ctx.fillText(truncateToWidth(ctx, heroTitle, inner), cx, y);
    ctx.font = NEWS(heroSize);
    ctx.fillText(truncateToWidth(ctx, heroTail.replace(/^, /, ""), inner), cx, y + heroLead);
  }
  y += heroFits ? heroLead : heroLead * 2;
  if (label) {
    // In --text: it's the one fact the card vouches for (or honestly doesn't).
    y += g.label;
    ctx.textAlign = "center";
    mono(ctx, TEXT);
    ctx.fillText(label, cx, y);
    track(ctx, 0);
    y += MONO_LEAD;
  }

  if (withCloser && closer.length) {
    y += g.closer;
    ctx.textAlign = "center";
    ctx.fillStyle = TEXT_2;
    ctx.font = NEWS(closerSize);
    for (const line of closer) {
      ctx.fillText(line, cx, y);
      y += closerLead;
    }
  }

  // ---- foot
  ctx.save();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = X;
  ctx.setLineDash([4 * X, 3 * X]);
  ctx.beginPath();
  ctx.moveTo(padX, ruleY);
  ctx.lineTo(CARD_WIDTH - padX, ruleY);
  ctx.stroke();
  ctx.restore();

  mono(ctx);
  const handle = username ? `@${username}` : "";
  ctx.textAlign = "right";
  const handleW = handle ? Math.min(ctx.measureText(handle).width, inner / 2) : 0;
  if (handle) ctx.fillText(truncateToWidth(ctx, handle, inner / 2), CARD_WIDTH - padX, rowY);
  ctx.textAlign = "left";
  const concept = edition != null ? `UNA CONEXIÓN · Nº ${String(edition).padStart(3, "0")}` : "UNA CONEXIÓN";
  ctx.fillText(truncateToWidth(ctx, concept, inner - handleW - 12 * X), padX, rowY);
  track(ctx, 0);

  drawLockup(ctx, cx, markCy, markSize, "center", TEXT);
}
