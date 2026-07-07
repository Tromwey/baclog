import { CARD_HEIGHT, CARD_WIDTH, type CardBacklog } from "../types";
import { DISPLAY, MONO } from "./fonts";
import {
  CARD_TOKENS,
  drawGrain,
  footerUrl,
  hashString,
  mulberry32,
  truncateToWidth,
} from "./util";

/**
 * Deterministic generative field seeded by the backlog's genres+years+moods
 * (ADR-008: own IP, zero copyrighted pixels). Two different backlogs must
 * produce visibly different patterns; the same backlog always the same one.
 */
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  backlog: CardBacklog,
) {
  const seedInput = backlog.items
    .map((i) => `${i.genre}|${i.year}|${i.mood}`)
    .join("::");
  const seed = hashString(seedInput);
  const rand = mulberry32(seed);

  // Genre mix → base hue · year spread → density · moods → dominant shape
  const baseHue = seed % 360;
  const years = backlog.items.map((i) => i.year);
  // Empty backlog: Math.max(...[]) is -Infinity — degrade to spread 0
  const spread =
    years.length > 0 ? Math.max(...years) - Math.min(...years) : 0;
  const shapeCount = 56 + Math.min(spread, 12) * 4 + (seed % 16);
  const moodHash = hashString(backlog.items.map((i) => i.mood).join(","));
  const dominant = moodHash % 3; // 0 arcs · 1 bars · 2 dots

  const bg = `hsl(${baseHue}, 42%, 12%)`;
  const palette = [0, 28, 180, 210].map(
    (offset, i) =>
      `hsl(${(baseHue + offset) % 360}, ${58 + i * 8}%, ${52 + i * 9}%)`,
  );

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  for (let i = 0; i < shapeCount; i++) {
    const kind = rand() < 0.55 ? dominant : Math.floor(rand() * 3);
    const color = palette[Math.floor(rand() * palette.length)];
    const x = rand() * CARD_WIDTH;
    const y = rand() * CARD_HEIGHT;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + rand() * 0.5;

    if (kind === 0) {
      const r = 40 + rand() * 160;
      ctx.lineWidth = 10 + rand() * 26;
      ctx.beginPath();
      ctx.arc(x, y, r, rand() * Math.PI * 2, rand() * Math.PI * 1.6 + 0.6);
      ctx.stroke();
    } else if (kind === 1) {
      const w = 14 + rand() * 40;
      const h = 90 + rand() * 380;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.floor(rand() * 4) * Math.PI) / 4);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      const r = 8 + rand() * 42;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Center panel
  const panelH = 460;
  const panelY = (CARD_HEIGHT - panelH) / 2;
  ctx.fillStyle = "rgba(10, 8, 14, 0.78)";
  ctx.fillRect(0, panelY, CARD_WIDTH, panelH);

  ctx.textAlign = "center";
  ctx.fillStyle = CARD_TOKENS.text;
  ctx.font = MONO(40, true);
  ctx.fillText("*  B A C L O G  *", CARD_WIDTH / 2, panelY + 110);

  ctx.font = DISPLAY(92, 800);
  ctx.fillText(
    truncateToWidth(ctx, backlog.name, CARD_WIDTH - 160),
    CARD_WIDTH / 2,
    panelY + 260,
  );

  const date = new Date()
    .toLocaleDateString("en-US", { month: "short", year: "numeric" })
    .toUpperCase();
  ctx.font = MONO(38);
  ctx.fillStyle = "rgba(244, 241, 234, 0.75)";
  ctx.fillText(
    `${backlog.items.length} ITEMS · ${date}`,
    CARD_WIDTH / 2,
    panelY + 350,
  );

  // Footer band + watermark — always bottom-center (sistema-diseno §5)
  ctx.fillStyle = "rgba(10, 8, 14, 0.85)";
  ctx.fillRect(0, CARD_HEIGHT - 170, CARD_WIDTH, 170);
  ctx.fillStyle = CARD_TOKENS.text;
  ctx.font = MONO(42, true);
  ctx.fillText(footerUrl(backlog.username), CARD_WIDTH / 2, CARD_HEIGHT - 68);

  drawGrain(ctx, CARD_WIDTH, CARD_HEIGHT, 0.06, seed);
}
