import {
  CARD_HEIGHT,
  CARD_WIDTH,
  STATUS_LABEL,
  type CardBacklog,
  type CardItem,
  type MediaType,
} from "../types";
import { MONO, OSWALD } from "./fonts";
import { clampRating, footerUrl, truncateToWidth, wrapText } from "./util";

const BG: Record<MediaType, string> = {
  film: "#7a2e2b",
  album: "#232f52",
  series: "#25422f",
};
const TICKET_FACE: Record<MediaType, string> = {
  film: "#8f3a35",
  album: "#2c3a63",
  series: "#2e5039",
};
const CREAM = "#f5ecd9";
const CREAM_SOFT = "rgba(245, 236, 217, 0.65)";

export function drawTicket(
  ctx: CanvasRenderingContext2D,
  backlog: CardBacklog,
  item: CardItem,
) {
  ctx.fillStyle = BG[item.type];
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Ticket body with side punch-notches
  const tx = 90;
  const ty = 260;
  const tw = CARD_WIDTH - tx * 2;
  const th = CARD_HEIGHT - ty * 2;
  ctx.fillStyle = TICKET_FACE[item.type];
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 36);
  ctx.fill();

  const perfY = ty + th - 420;
  ctx.fillStyle = BG[item.type];
  for (const side of [tx, tx + tw]) {
    ctx.beginPath();
    ctx.arc(side, perfY, 42, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Title — flows from the top, max 2 lines
  ctx.textAlign = "left";
  ctx.fillStyle = CREAM;
  ctx.font = OSWALD(120, 700);
  const titleMax = tw - 140;
  const allLines = wrapText(ctx, item.title.toUpperCase(), titleMax);
  const lines = allLines.slice(0, 2);
  if (allLines.length > 2) {
    lines[1] = truncateToWidth(ctx, `${lines[1]} ${allLines[2]}`, titleMax);
  }
  let y = ty + 380;
  for (const line of lines) {
    ctx.fillText(line, tx + 70, y);
    y += 132;
  }

  ctx.font = OSWALD(48, 400);
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillText(`${item.year} · ${item.byline.toUpperCase()}`, tx + 70, y - 32);

  // Stars + stamp anchor upward from the perforation, so they never collide
  if (item.status === "completed" && item.rating) {
    const r = clampRating(item.rating);
    ctx.fillStyle = CREAM;
    ctx.font = OSWALD(84, 600);
    ctx.fillText("★ ".repeat(r) + "☆ ".repeat(5 - r), tx + 70, perfY - 240);
  }

  // Status stamp — rotated stroked box, like an ink stamp
  ctx.save();
  ctx.translate(tx + 90, perfY - 110);
  ctx.rotate(-0.04);
  ctx.font = OSWALD(56, 600);
  const label = (item.statusLabelOverride ?? STATUS_LABEL[item.status]).toUpperCase();
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

  // Stub
  ctx.font = MONO(38, true);
  ctx.fillStyle = CREAM;
  ctx.fillText("SEAT: ON MY COUCH", tx + 70, perfY + 110);
  ctx.font = MONO(38);
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillText(`ROW: ${backlog.name.toUpperCase()}`, tx + 70, perfY + 180);

  ctx.font = MONO(42, true);
  ctx.fillStyle = CREAM;
  ctx.textAlign = "center";
  ctx.fillText(footerUrl(backlog.username), CARD_WIDTH / 2, ty + th - 90);
}
