import { tintEnds } from "@/components/kura/tint";
import {
  CHECK_FILL_PATH,
  CLOCK_PATH,
  FLAME_PATH,
  LIKE_PATH,
} from "@/components/glyph-paths";
import { CARD_HEIGHT, CARD_WIDTH, type CardBacklog, type CardItem, type MediaType } from "../types";
import { drawLockup, track } from "./brand";
import { drawCover } from "./collection";
import { NEWS, RHMONO, SANS } from "./fonts";
import { truncateToWidth, wrapText } from "./util";

/**
 * The title card (Compartir tarjeta from the ficha, `/item/[id]/card`): one
 * title as Kura shows it — replaces the English "ADMIT ONE" ticket
 * (founder, 2026-09-27). 1080×1920, the same 300×533 frame × 3.6 as the
 * collection card so the two read as one family:
 *
 *   the kind and year in mono · the cover at its native form (póster 2:3,
 *   disco 1:1) · the title in Newsreader italic (works go in italic) · the
 *   creator in mono · your state as the app names it (Completo, Me
 *   obsesiona, Me gusta, No puedo esperar · fecha) · a dashed foot with the
 *   collection and the @handle · the 蔵 kura lockup.
 *
 * The surface is the title's own palette as the tinted 168° gradient
 * (`tintEnds`, capped for AA), the cover is that palette as the no-art
 * recipe (ADR-008: `CardItem` has no image field — the PNG never carries
 * artwork). There is no negative state: a "disliked" verdict prints nothing
 * (voz · regla 11), and "in progress" isn't a Kura state either.
 */

const X = 3.6;
const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";
/** The borderless glass fill of a pill (`--glass-bg`, a touch denser on a tint). */
const PILL_FILL = "rgba(255,255,255,0.1)";

/** Pill colours = the state tokens (`--st-*` in globals.css). */
const ST = {
  obsessed: "#ec8e76",
  liked: "#9cbae1",
  completed: "#a0cba0",
  waiting: "#b9a6e8",
} as const;

const KIND: Record<MediaType, string> = {
  film: "CINE",
  series: "SERIE",
  album: "ÁLBUM",
};

/** Cover size on the 300-wide frame: a single cover, larger than the fan's lead. */
const COVER = { poster: [160, 240], album: [200, 200] } as const;

type Pill = { d: string; color: string; label: string };

/**
 * A release day as a date, never a countdown — a shared image outlives the
 * "faltan 3 d" (voz · regla 8). UTC, like every stored release_date (see
 * `releaseLabel` in kura/tint.ts); the year only when it isn't this one.
 */
function releaseDay(iso: string, now: number): string {
  const date = new Date(iso);
  const year = (d: Date) => d.getUTCFullYear();
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    ...(year(date) === year(new Date(now)) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
    .format(date)
    .replace(/\./g, "")
    .replace(/ de /g, " ");
}

/** Your state, in the app's own words (first person: it's your card). */
export function titlePills(item: CardItem, now = Date.now()): Pill[] {
  const pills: Pill[] = [];
  const upcoming = item.releaseDate ? new Date(item.releaseDate).getTime() > now : false;
  if (upcoming) {
    pills.push({ d: CLOCK_PATH, color: ST.waiting, label: `No puedo esperar · ${releaseDay(item.releaseDate!, now)}` });
  } else if (item.status === "completed") {
    pills.push({ d: CHECK_FILL_PATH, color: ST.completed, label: "Completo" });
  }
  if (item.reaction === "obsessed") pills.push({ d: FLAME_PATH, color: ST.obsessed, label: "Me obsesiona" });
  else if (item.reaction === "liked") pills.push({ d: LIKE_PATH, color: ST.liked, label: "Me gusta" });
  return pills;
}

const PILL_H = 30 * X;
const PILL_PAD = 13 * X;
const PILL_GLYPH = 13 * X;
const PILL_GAP_IN = 6 * X;
const PILL_GAP = 8 * X;
const PILL_FONT = SANS(12.5 * X, 600);

function pillWidth(ctx: CanvasRenderingContext2D, p: Pill): number {
  ctx.font = PILL_FONT;
  return PILL_PAD * 2 + PILL_GLYPH + PILL_GAP_IN + ctx.measureText(p.label).width;
}

function drawPill(ctx: CanvasRenderingContext2D, p: Pill, x: number, y: number) {
  const w = pillWidth(ctx, p);
  ctx.save();
  ctx.fillStyle = PILL_FILL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, PILL_H, PILL_H / 2);
  ctx.fill();
  // The glyph on the system's 24×24 grid.
  ctx.save();
  ctx.translate(x + PILL_PAD, y + (PILL_H - PILL_GLYPH) / 2);
  ctx.scale(PILL_GLYPH / 24, PILL_GLYPH / 24);
  ctx.fillStyle = p.color;
  ctx.fill(new Path2D(p.d));
  ctx.restore();
  ctx.fillStyle = TEXT;
  ctx.font = PILL_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(p.label, x + PILL_PAD + PILL_GLYPH + PILL_GAP_IN, y + PILL_H / 2 + X * 0.5);
  ctx.restore();
}

export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  backlog: CardBacklog,
  item: CardItem,
  now = Date.now(),
) {
  // Surface: the title's palette as the 168° tint (same as the collection card).
  const [top, bottom] = tintEnds(item.palette ?? []);
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

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Eyebrow: what it is and when — data, in mono.
  const monoSize = 9 * X;
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(monoSize);
  track(ctx, monoSize * 0.08);
  ctx.fillText(`${KIND[item.type]} · ${item.year}`, cx, padY);
  track(ctx, 0);

  // Foot (fixed): the dashed rule, collection · @handle, the lockup.
  // (§marca · C: the kanji is twice the wordmark, so the lockup is 2 × markSize tall).
  const markSize = 14 * X;
  const markCy = CARD_HEIGHT - padY - markSize;
  const rowY = markCy - markSize - 10 * X - monoSize * 1.2;
  const ruleY = rowY - 12 * X;

  // Body, centred between the eyebrow and the rule: cover, title, creator, pills.
  const album = item.type === "album";
  const [cw, ch] = (album ? COVER.album : COVER.poster).map((v) => v * X);
  const titleSize = 30 * X;
  const titleLead = titleSize * 1.08;
  ctx.font = NEWS(titleSize, true);
  let titleLines = wrapText(ctx, item.title, inner);
  if (titleLines.length > 2) {
    titleLines = [titleLines[0], truncateToWidth(ctx, titleLines.slice(1).join(" "), inner)];
  }
  const pills = titlePills(item, now);
  const creator = item.byline.trim();

  const gapCover = 20 * X;
  const gapCreator = 8 * X;
  const gapPills = 16 * X;
  const blockH =
    ch +
    gapCover +
    titleLines.length * titleLead +
    (creator ? gapCreator + monoSize * 1.2 : 0) +
    (pills.length ? gapPills + PILL_H : 0);
  const areaTop = padY + monoSize * 1.2 + 18 * X;
  const areaBottom = ruleY - 18 * X;
  let y = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2);

  drawCover(ctx, item, cx, y + ch / 2, cw, ch, 0, 14 * X);
  y += ch + gapCover;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT;
  ctx.font = NEWS(titleSize, true);
  for (const line of titleLines) {
    ctx.fillText(line, cx, y);
    y += titleLead;
  }

  if (creator) {
    y += gapCreator;
    ctx.fillStyle = TEXT_2;
    ctx.font = RHMONO(monoSize);
    track(ctx, monoSize * 0.08);
    ctx.fillText(truncateToWidth(ctx, creator.toUpperCase(), inner), cx, y);
    track(ctx, 0);
    y += monoSize * 1.2;
  }

  if (pills.length) {
    y += gapPills;
    const widths = pills.map((p) => pillWidth(ctx, p));
    const total = widths.reduce((a, b) => a + b, 0) + PILL_GAP * (pills.length - 1);
    let x = cx - total / 2;
    pills.forEach((p, i) => {
      drawPill(ctx, p, x, y);
      x += widths[i] + PILL_GAP;
    });
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = X;
  ctx.setLineDash([4 * X, 3 * X]);
  ctx.beginPath();
  ctx.moveTo(padX, ruleY);
  ctx.lineTo(CARD_WIDTH - padX, ruleY);
  ctx.stroke();
  ctx.restore();

  ctx.textBaseline = "top";
  ctx.fillStyle = TEXT_2;
  ctx.font = RHMONO(monoSize);
  track(ctx, monoSize * 0.08);
  const handle = backlog.username ? `@${backlog.username}` : "";
  ctx.textAlign = "right";
  const handleW = handle ? Math.min(ctx.measureText(handle).width, inner / 2) : 0;
  if (handle) ctx.fillText(truncateToWidth(ctx, handle, inner / 2), CARD_WIDTH - padX, rowY);
  if (backlog.name) {
    ctx.textAlign = "left";
    const room = inner - handleW - 12 * X;
    ctx.fillText(truncateToWidth(ctx, `EN ${backlog.name.toUpperCase()}`, room), padX, rowY);
  }
  track(ctx, 0);

  drawLockup(ctx, cx, markCy, markSize, "center", TEXT);
}
