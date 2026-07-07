import { CARD_HEIGHT, CARD_WIDTH, type DoubleFeatureData } from "../types";
import { normalizePalette } from "../double-feature/palette-utils";
import { DISPLAY, MONO, SERIF } from "./fonts";
import { drawGrain, footerUrl, hashString, mulberry32, wrapText } from "./util";

/**
 * ⭐ Double Feature SHARE card — canvas renderer (FRAME A of
 * double-feature-final.reference.html). Reuses the exact rasterization path as
 * receipt/ticket/pattern (drawCard → canvas.toBlob → Web Share), so the F3.5.5
 * export needs no new dependency and no DOM screenshotting.
 *
 * ADR-008: the exported PNG contains ZERO copyrighted artwork — the two discs
 * are generated purely from the extracted palette + grain. Real covers live
 * in-app only (the discovery UI), never here.
 */

const C = {
  bg: "#0B0B0D",
  text: "#F4F3EE",
  text2: "#A9A8B2",
  text3: "#6C6B76",
  accent: "#D8FF3E",
};

const TYPE_LABEL: Record<string, string> = {
  film: "PELÍCULA",
  series: "SERIE",
  album: "ÁLBUM",
};
/** Side label under each disc, by media type (album → vinyl "MUSIC"). */
const SIDE_LABEL: Record<string, string> = {
  film: "FILM",
  series: "SERIES",
  album: "MUSIC",
};

export function drawDoubleFeature(
  ctx: CanvasRenderingContext2D,
  data: DoubleFeatureData,
) {
  const { seed, reco, narrative, username, edition } = data;
  const p = normalizePalette(data.palette);

  // Base
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Double aura from the two dominant palette colors (top seed / bottom reco).
  radialAura(ctx, p[0], 0.2, 0, 900, false);
  radialAura(ctx, p[3] ?? p[1], 0.82, 1, 860, true);

  // Header
  ctx.textAlign = "left";
  ctx.fillStyle = C.text2;
  ctx.font = MONO(30, true);
  ctx.fillText("BACLOG · DOUBLE FEATURE", 64, 130);
  if (edition != null) {
    ctx.textAlign = "right";
    ctx.fillText(`Nº ${String(edition).padStart(3, "0")}`, CARD_WIDTH - 64, 130);
    ctx.textAlign = "left";
  }

  // Hook (part 1 — the why)
  ctx.fillStyle = C.accent;
  ctx.font = MONO(30);
  ctx.fillText(narrative.hookEyebrow.toUpperCase(), 64, 230);
  ctx.fillStyle = C.text;
  ctx.font = DISPLAY(72, 700);
  let y = 320;
  for (const line of wrapText(ctx, narrative.hookTitle, CARD_WIDTH - 128).slice(0, 3)) {
    ctx.fillText(line, 64, y);
    y += 84;
  }

  // Objects: giant lima "×" behind two generative discs
  const cx = CARD_WIDTH / 2;
  const discY = 1000;
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(216,255,62,0.08)";
  ctx.font = DISPLAY(560, 800);
  ctx.fillText("×", cx, discY + 190);
  ctx.restore();

  // Side A (seed) — reel if video, vinyl if album
  drawDisc(ctx, {
    x: cx - 230,
    y: discY,
    radius: 210,
    tilt: -0.12,
    palette: p,
    seed: `${seed.title}-A`,
    kind: seed.type === "album" ? "vinyl" : "reel",
    title: seed.title,
    sub: seed.type === "album" ? seed.creator : seed.year != null ? String(seed.year) : undefined,
    sideLabel: `A · ${SIDE_LABEL[seed.type] ?? "FILM"}`,
    sideColor: "#9DB06E",
  });
  // Side B (reco) — the opposite family
  drawDisc(ctx, {
    x: cx + 230,
    y: discY + 70,
    radius: 220,
    tilt: 0.14,
    palette: p,
    seed: `${reco.title}-B`,
    kind: reco.type === "album" ? "vinyl" : "reel",
    title: reco.title,
    sub: reco.type === "album" ? reco.creator : reco.year != null ? String(reco.year) : undefined,
    sideLabel: `B · ${SIDE_LABEL[reco.type] ?? "MUSIC"}`,
    sideColor: C.accent,
  });

  // Per-work metadata
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  ctx.font = SERIF(56);
  ctx.fillText(seed.title, 64, 1420);
  ctx.textAlign = "right";
  ctx.fillText(reco.title, CARD_WIDTH - 64, 1420);
  ctx.fillStyle = C.text2;
  ctx.font = MONO(24);
  ctx.textAlign = "left";
  ctx.fillText(workMeta(seed), 64, 1465);
  ctx.textAlign = "right";
  ctx.fillText(workMeta(reco), CARD_WIDTH - 64, 1465);

  // Hero (part 2 — the result narrative)
  ctx.textAlign = "left";
  ctx.fillStyle = C.accent;
  ctx.font = MONO(30);
  ctx.fillText(narrative.resultEyebrow.toUpperCase(), 64, 1580);
  ctx.fillStyle = C.text;
  ctx.font = DISPLAY(84, 700);
  const heroLine = reco.creator ? `${reco.title}, de ${reco.creator}.` : `${reco.title}.`;
  let hy = 1670;
  for (const line of wrapText(ctx, heroLine, CARD_WIDTH - 128).slice(0, 2)) {
    ctx.fillText(line, 64, hy);
    hy += 96;
  }
  if (narrative.closer) {
    ctx.fillStyle = C.text2;
    ctx.font = SERIF(52);
    for (const line of wrapText(ctx, narrative.closer, CARD_WIDTH - 128).slice(0, 2)) {
      ctx.fillText(line, 64, hy + 20);
      hy += 62;
    }
  }

  // Watermark / CTA
  ctx.fillStyle = C.text3;
  ctx.font = MONO(26, true);
  ctx.fillText("ARMA TU DOUBLE FEATURE EN", 64, CARD_HEIGHT - 120);
  ctx.fillStyle = C.text;
  ctx.font = DISPLAY(52, 800);
  const url = footerUrl(username);
  ctx.fillText(url, 64, CARD_HEIGHT - 62);

  // Grain last, over everything (ADR-008: the analog-artifact detail)
  drawGrain(ctx, CARD_WIDTH, CARD_HEIGHT, 0.06, hashString(`${seed.title}-${reco.title}`));
}

function radialAura(
  ctx: CanvasRenderingContext2D,
  color: string,
  xFrac: number,
  yFrac: 0 | 1,
  height: number,
  bottom: boolean,
) {
  const cx = CARD_WIDTH * xFrac;
  const cy = bottom ? CARD_HEIGHT : 0;
  void yFrac;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, height);
  grad.addColorStop(0, hexA(color, 0.9));
  grad.addColorStop(0.34, hexA(shade(color), 0.7));
  grad.addColorStop(0.72, hexA(C.bg, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, bottom ? CARD_HEIGHT - height : 0, CARD_WIDTH, height);
}

interface DiscOpts {
  x: number;
  y: number;
  radius: number;
  tilt: number;
  palette: string[];
  seed: string;
  kind: "reel" | "vinyl";
  title: string;
  sub?: string;
  sideLabel: string;
  sideColor: string;
}

/** A generative disc built ONLY from the palette + grain (no cover art). */
function drawDisc(ctx: CanvasRenderingContext2D, o: DiscOpts) {
  const rand = mulberry32(hashString(o.seed));
  const startAngle = rand() * Math.PI * 2;

  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.tilt);

  // Outer disc body (dark) with drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.beginPath();
  ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#0f0b0a";
  ctx.fill();
  ctx.restore();

  // Palette conic-ish face (approximated by pie wedges, deterministic order).
  const faceR = o.radius * 0.78;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, faceR, 0, Math.PI * 2);
  ctx.clip();
  const wedges = 4;
  for (let i = 0; i < wedges; i++) {
    const a0 = startAngle + (i / wedges) * Math.PI * 2;
    const a1 = startAngle + ((i + 1) / wedges) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, faceR, a0, a1);
    ctx.closePath();
    ctx.fillStyle = o.palette[i % o.palette.length];
    ctx.fill();
  }
  ctx.restore();

  if (o.kind === "vinyl") {
    // Concentric grooves
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = 1;
    for (let r = 12; r < faceR; r += 5) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Reel perforations
    ctx.fillStyle = "#0c0a09";
    for (let i = 0; i < 6; i++) {
      const a = startAngle + (i / 6) * Math.PI * 2;
      const pr = o.radius * 0.62;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * pr, Math.sin(a) * pr, o.radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Center label hub
  ctx.beginPath();
  ctx.arc(0, 0, o.radius * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = "#12100f";
  ctx.fill();
  ctx.save();
  ctx.rotate(-o.tilt); // keep text upright
  ctx.textAlign = "center";
  ctx.fillStyle = C.text;
  ctx.font = SERIF(o.radius * 0.2);
  ctx.fillText(truncate(o.title, 10), 0, 0);
  if (o.sub) {
    ctx.fillStyle = C.text2;
    ctx.font = MONO(o.radius * 0.09);
    ctx.fillText(o.sub.toUpperCase(), 0, o.radius * 0.16);
  }
  // spindle dot
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#0c0a09";
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Side label under the disc (upright)
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = o.sideColor;
  ctx.font = MONO(26);
  ctx.fillText(o.sideLabel, o.x, o.y + o.radius + 44);
  ctx.restore();
}

function workMeta(w: { type: string; year?: number; meta?: string; creator?: string }): string {
  return [TYPE_LABEL[w.type] ?? w.type.toUpperCase(), w.type === "album" ? w.creator?.toUpperCase() : w.year, w.meta]
    .filter(Boolean)
    .join(" · ");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Hex → rgba string with alpha (canvas gradients need explicit alpha stops). */
function hexA(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(11,11,13,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Darken a hex toward the aura mid-stop (never fully black). */
function shade(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "#5a231a";
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * 0.42);
  const g = Math.round(((n >> 8) & 255) * 0.42);
  const b = Math.round((n & 255) * 0.42);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
