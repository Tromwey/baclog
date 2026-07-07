import type { CSSProperties } from "react";
import { CARD_HEIGHT, CARD_WIDTH, type DoubleFeatureData, type DoubleFeatureWork } from "../types";
import { auraColors, discFace, normalizePalette } from "./palette-utils";

/**
 * ⭐ Double Feature — the cross-media SHARE card (FRAME A of
 * double-feature-final.reference.html). PRESENTATIONAL + PROPS-DRIVEN: the
 * F3.5.5 agent feeds real data and wires the export/PNG. Renders the exact
 * exportable artifact at native 1080×1920 — the seed work × the reco, as two
 * generative discs built ONLY from the extracted palette + grain (ADR-008:
 * zero cover art), the LLM narrative as hero, per-work metadata, a J-card
 * spine tracklist, and the always-on watermark.
 *
 * Rasterize with the surrounding container scaled to 1 (or use
 * <DoubleFeaturePreview> for an in-app thumbnail).
 */

const FONT = {
  display: "'Bricolage Grotesque', sans-serif",
  serif: "'Instrument Serif', serif",
  sans: "'Hanken Grotesk', sans-serif",
  mono: "'Space Mono', monospace",
};
const C = {
  bg: "#0B0B0D",
  text: "#F4F3EE",
  text2: "#A9A8B2",
  text3: "#6C6B76",
  accent: "#D8FF3E",
};

/** SVG fractal-noise grain, matching the reference .grain overlay. */
function Grain({ opacity = 0.08, strong = false }: { opacity?: number; strong?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity,
        mixBlendMode: strong ? "soft-light" : "overlay",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='130'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: strong ? "78px 78px" : "130px 130px",
      }}
    />
  );
}

/** Media-type → disc shape (album = vinyl, film/series = film reel). */
type DiscShape = "reel" | "vinyl";
const DISC_SHAPE: Record<string, DiscShape> = { film: "reel", series: "reel", album: "vinyl" };
/** Media-type → mono side label (album reads MUSIC; video reads FILM/SERIES). */
const SIDE_LABEL: Record<string, string> = { film: "FILM", series: "SERIES", album: "MUSIC" };

/** Layout follows the SIDE (A left / B right), independent of disc shape. */
const SIDE_POS: Record<"A" | "B", CSSProperties> = {
  A: { left: 36, top: 60, transform: "rotate(-7deg)" },
  B: { right: 26, top: 150, transform: "rotate(8deg)" },
};

/** Side A — film reel disc (generative, palette-driven, with reel perforations). */
function ReelDisc({
  face,
  title,
  year,
  side,
  sideLabel,
}: {
  face: string;
  title: string;
  year?: number;
  side: "A" | "B";
  sideLabel: string;
}) {
  return (
    <div style={{ position: "absolute", ...SIDE_POS[side], width: 380, height: 380 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 36% 30%,#2c211c,#0f0b0a 72%)", boxShadow: "0 30px 60px rgba(0,0,0,.6),inset 0 0 0 3px #000" }} />
      <div style={{ position: "absolute", inset: 16, borderRadius: "50%", background: "repeating-conic-gradient(from 0deg,rgba(217,200,179,.14) 0 3.4deg,transparent 3.4deg 9deg)" }} />
      <div style={{ position: "absolute", inset: 58, borderRadius: "50%", overflow: "hidden", background: face }}>
        <Grain opacity={0.22} strong />
      </div>
      {/* film-reel perforations */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle 24px at 74.4% 50%,#0c0a09 92%,transparent 94%),radial-gradient(circle 24px at 62.2% 71.1%,#0c0a09 92%,transparent 94%),radial-gradient(circle 24px at 37.8% 71.1%,#0c0a09 92%,transparent 94%),radial-gradient(circle 24px at 25.6% 50%,#0c0a09 92%,transparent 94%),radial-gradient(circle 24px at 37.8% 28.9%,#0c0a09 92%,transparent 94%),radial-gradient(circle 24px at 62.2% 28.9%,#0c0a09 92%,transparent 94%)" }} />
      <div style={{ position: "absolute", inset: 112, borderRadius: "50%", background: "radial-gradient(circle at 42% 34%,#17120f,#08060a 82%)", boxShadow: "0 0 0 3px rgba(0,0,0,.5),inset 0 0 16px rgba(0,0,0,.6)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 36, color: C.text, lineHeight: 1 }}>{title}</div>
        {year != null && <div style={{ fontFamily: FONT.mono, fontSize: 12, letterSpacing: ".16em", color: C.text2, marginTop: 2 }}>{year}</div>}
      </div>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 15, height: 15, margin: "-7px 0 0 -7px", borderRadius: "50%", background: "#0c0a09", boxShadow: "0 0 0 3px rgba(255,255,255,.05)" }} />
      <div style={{ position: "absolute", ...(side === "A" ? { left: 20 } : { right: 20 }), bottom: -2, fontFamily: FONT.mono, fontSize: 18, letterSpacing: ".14em", color: side === "A" ? "#9DB06E" : C.accent }}>{side} · {sideLabel}</div>
    </div>
  );
}

/** Side B — vinyl disc (generative, palette-driven, with groove + sheen). */
function VinylDisc({
  face,
  title,
  creator,
  side,
  sideLabel,
}: {
  face: string;
  title: string;
  creator?: string;
  side: "A" | "B";
  sideLabel: string;
}) {
  return (
    <div style={{ position: "absolute", ...SIDE_POS[side], width: 400, height: 400 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden", background: face }}>
        <Grain opacity={0.22} strong />
      </div>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "repeating-radial-gradient(circle at 50% 50%,rgba(0,0,0,.30) 0 1px,transparent 1px 5px)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(from 120deg,transparent 0 40deg,rgba(255,255,255,.18) 62deg,transparent 96deg 236deg,rgba(255,255,255,.10) 262deg,transparent 300deg)", mixBlendMode: "screen", opacity: 0.55 }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 0 2px rgba(0,0,0,.5),inset 0 0 40px rgba(0,0,0,.35)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 132, borderRadius: "50%", background: "radial-gradient(circle at 42% 34%,#16110f,#08060a 82%)", boxShadow: "0 0 0 3px rgba(0,0,0,.45),inset 0 0 14px rgba(0,0,0,.55)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 30, color: C.text }}>{title}</div>
        {creator && <div style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: ".16em", color: C.text2, marginTop: 2 }}>{creator.toUpperCase()}</div>}
      </div>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 15, height: 15, margin: "-7px 0 0 -7px", borderRadius: "50%", background: C.bg }} />
      <div style={{ position: "absolute", ...(side === "B" ? { right: 24 } : { left: 24 }), bottom: 6, fontFamily: FONT.mono, fontSize: 18, letterSpacing: ".14em", color: side === "B" ? "#efe9df" : "#9DB06E" }}>{side} · {sideLabel}</div>
    </div>
  );
}

/** Pick the disc shape by media type: album → vinyl, film/series → reel. */
function Disc({
  work,
  face,
  side,
}: {
  work: DoubleFeatureWork;
  face: string;
  side: "A" | "B";
}) {
  const shape = DISC_SHAPE[work.type] ?? "reel";
  const sideLabel = SIDE_LABEL[work.type] ?? work.type.toUpperCase();
  return shape === "vinyl" ? (
    <VinylDisc face={face} title={work.title} creator={work.creator} side={side} sideLabel={sideLabel} />
  ) : (
    <ReelDisc face={face} title={work.title} year={work.year} side={side} sideLabel={sideLabel} />
  );
}

export function DoubleFeatureCard({ data }: { data: DoubleFeatureData }) {
  const { seed, reco, palette, narrative, username, edition } = data;
  const p = normalizePalette(palette);
  const aura = auraColors(p);
  const seedFace = discFace(p, `${seed.title}-A`);
  const recoFace = discFace(p, `${reco.title}-B`);
  const editionLabel = edition != null ? `nº ${String(edition).padStart(3, "0")}` : "";

  const root: CSSProperties = {
    position: "relative",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    background: C.bg,
    color: C.text,
    padding: "70px 64px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: FONT.sans,
  };

  return (
    <div style={root}>
      {/* Double aura from the two dominant palette colors */}
      <div aria-hidden style={{ position: "absolute", inset: 0, height: 900, background: `radial-gradient(120% 78% at 20% 0%,${aura.top} 0%,${shade(aura.top)} 32%,${C.bg} 70%)`, pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 860, background: `radial-gradient(120% 78% at 82% 100%,${aura.bottom} 0%,${shade(aura.bottom)} 30%,rgba(11,11,13,0) 66%)`, pointerEvents: "none" }} />
      <Grain opacity={0.08} />

      {/* Header */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: ".16em", fontSize: 22, color: C.text2 }}>
        <span>baclog · double feature</span>
        {editionLabel && <span>{editionLabel}</span>}
      </div>

      {/* Hook (part 1 — the why) */}
      <div style={{ position: "relative", marginTop: 40 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 22, letterSpacing: ".16em", color: C.accent, textTransform: "uppercase" }}>{narrative.hookEyebrow}</div>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 62, lineHeight: 1.06, letterSpacing: "-.02em", marginTop: 14 }}>{narrative.hookTitle}</div>
      </div>

      {/* Objects: two generative discs + giant lima "×" behind */}
      <div style={{ position: "relative", height: 600, marginTop: "auto" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", fontFamily: FONT.display, fontWeight: 800, fontSize: 520, lineHeight: 1, color: "rgba(216,255,62,.08)", letterSpacing: "-.04em" }}>×</div>
        <Disc work={seed} face={seedFace} side="A" />
        <Disc work={reco} face={recoFace} side="B" />
      </div>

      {/* Per-work metadata */}
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 28, marginTop: 22 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 46, lineHeight: 1, color: C.text }}>{seed.title}</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: ".1em", color: C.text2, marginTop: 6 }}>{workMeta(seed)}</div>
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 46, lineHeight: 1, color: C.text }}>{reco.title}</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 16, letterSpacing: ".1em", color: C.text2, marginTop: 6 }}>{workMeta(reco)}</div>
        </div>
      </div>

      {/* Hook (part 2 — the result) = narrative HERO */}
      <div style={{ position: "relative", marginTop: 34 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 22, letterSpacing: ".16em", color: C.accent, textTransform: "uppercase" }}>{narrative.resultEyebrow}</div>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 72, lineHeight: 1.02, letterSpacing: "-.02em", marginTop: 12 }}>
          <span style={{ fontFamily: FONT.serif, fontStyle: "italic", fontWeight: 400 }}>{reco.title}</span>
          {reco.creator ? <>, de <span style={{ color: C.accent }}>{reco.creator}</span>.</> : "."}
        </div>
        {narrative.closer && (
          <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 48, lineHeight: 1.22, color: C.text2, marginTop: 14 }}>{narrative.closer}</div>
        )}
      </div>

      {/* J-card spine (Side B tracklist) + watermark/CTA */}
      <div style={{ position: "relative", marginTop: "auto" }}>
        <div style={{ background: "rgba(7,7,9,.74)", backdropFilter: "blur(6px)", border: "1px solid #24242c", borderRadius: 18, padding: "24px 26px" }}>
          <div style={{ display: "flex", gap: 14, fontFamily: FONT.mono, fontSize: 18, letterSpacing: ".08em", lineHeight: 1.5 }}>
            <span style={{ flex: "none", color: "#9DB06E" }}>SIDE A</span>
            <span style={{ color: "#CFCED6" }}>{spineLine(seed)}</span>
          </div>
          <div style={{ display: "flex", gap: 14, fontFamily: FONT.mono, fontSize: 18, letterSpacing: ".08em", lineHeight: 1.5, marginTop: 12 }}>
            <span style={{ flex: "none", color: C.accent }}>SIDE B</span>
            <span style={{ color: C.text }}>{spineLine(reco, reco.duration)}</span>
          </div>
          {reco.tracklist && reco.tracklist.length > 0 && (
            <div style={{ fontFamily: FONT.mono, fontSize: 15, letterSpacing: ".06em", lineHeight: 1.65, color: "#8F8E99", marginTop: 8, paddingLeft: 74 }}>
              {reco.tracklist.map((t) => t.toUpperCase()).join(" · ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 24 }}>
          <div>
            <div style={{ fontFamily: FONT.mono, fontSize: 14, letterSpacing: ".16em", color: C.text3, textTransform: "uppercase" }}>arma tu double feature en</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 36, letterSpacing: "-.01em", color: C.text, marginTop: 5 }}>
              baclog.app<span style={{ color: C.accent }}>/{username}</span>
            </div>
          </div>
          <div style={{ flex: "none", width: 66, height: 66, borderRadius: "50%", border: `2px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, color: C.accent, boxShadow: "0 0 26px rgba(216,255,62,.22)" }}>↗</div>
        </div>
      </div>
    </div>
  );
}

/** Per-work metadata line, e.g. "PELÍCULA · 2024 · 2H 46M". */
function workMeta(w: { type: string; year?: number; meta?: string; creator?: string }): string {
  const label: Record<string, string> = { film: "PELÍCULA", series: "SERIE", album: "ÁLBUM" };
  return [label[w.type] ?? w.type.toUpperCase(), w.type === "album" ? w.creator?.toUpperCase() : w.year, w.meta]
    .filter(Boolean)
    .join(" · ");
}

/** Spine line, e.g. "F1 · 2024 · VISTA ★★★★★" or "ROSIE · ROSÉ · 12 TRK · 42 MIN". */
function spineLine(
  w: { title: string; creator?: string; year?: number; meta?: string },
  duration?: string,
): string {
  return [w.title.toUpperCase(), w.creator?.toUpperCase() ?? w.year, w.meta, duration]
    .filter(Boolean)
    .join(" · ");
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
