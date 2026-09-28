import "server-only";
import { ImageResponse } from "next/og";
import { posterFallbackStyle } from "@/components/cover-tile";
import { BG, sealColors, sealInitials, tintEnds } from "@/components/kura/tint";
import { LOCKUP_C } from "@/components/kura/lockup-c";
import { OG_KANJI, loadOgFonts } from "@/lib/og";

/**
 * The link previews (`opengraph-image.tsx` of /u/[username], of a collection
 * and of a public ficha) as pure renderers: the routes do the gated read and
 * hand plain data here, so the dev card lab (`/prototype`) can draw the SAME
 * images with sample data and no database.
 *
 * One family: 1200×630, the owner's/title's palette as the 168° tint
 * (`tintEnds`, AA-capped), the 蔵 kura lockup top-left, the words bottom-left
 * sized for a ~300 px thumbnail (name ≥ 68 px, meta ≥ 30 px — critique
 * 2026-09-27), the covers on the right inside a 72 px margin (WhatsApp crops
 * the sides).
 */

export const OG_SIZE = { width: 1200, height: 630 };
/** The privacy window of a preview: shared 5-min TTL, no SWR (see the collection route). */
export const OG_TTL_SECONDS = 300;

const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";
const SURFACE_1 = "#141417";
const RADIUS = 22;

export type OgCover = {
  mediaType: "film" | "series" | "album";
  paletteHex: readonly string[] | null;
  /** A data URI from `coverDataUri`, or null → the palette recipe. */
  src: string | null;
};

/** The 404 every preview answers for private and nonexistent alike. */
export function ogNotFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

function background(hexes: readonly string[]) {
  const [top, bottom] = tintEnds(hexes);
  return hexes[0] ? `linear-gradient(168deg, ${top} 0%, ${bottom} 100%)` : BG;
}

/**
 * §marca · C "con kanji" (brand material) at the product proportions in
 * `LOCKUP_C` (components/kura/lockup-c.ts): 蔵 at 1.5× the wordmark, ~600
 * (the kanji ships as one Regular glyph, so the weight is a stroke of
 * `LOCKUP_C.stroke` em), gap 15/48, "kura" in Newsreader italic 500 at
 * −0.03 em, 蔵's ink centred on the kura's optical centre.
 *
 * Satori has no baseline alignment, so both boxes are top-aligned at
 * line-height 1 and 蔵 is placed by the fonts' metrics: Satori puts a
 * line-height-1 baseline at (1 + asc − desc) / 2 em from the box top (hhea:
 * Newsreader 0.735/0.265 → 0.735; the kanji 1.151/0.286 → 0.9325). 蔵 then
 * sits so its baseline is `LOCKUP_C.drop` under the kura's.
 */
const OG_NEWS_BASE = 0.735;
const OG_KANJI_BASE = 0.9325;
function OgLockup({ size = 40 }: { size?: number }) {
  const k = size * LOCKUP_C.kanji;
  const kanjiTop = size * (OG_NEWS_BASE + LOCKUP_C.drop) - k * OG_KANJI_BASE;
  // The row's own top is the higher of the two boxes; the other is pushed down.
  const lift = Math.min(0, kanjiTop);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: size * LOCKUP_C.gap }}>
      <span
        style={{
          fontFamily: OG_KANJI,
          fontSize: k,
          lineHeight: 1,
          marginTop: kanjiTop - lift,
          WebkitTextStrokeWidth: k * LOCKUP_C.stroke,
          WebkitTextStrokeColor: TEXT,
        }}
      >
        蔵
      </span>
      <span
        style={{
          fontFamily: "Newsreader",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: size,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginTop: -lift,
        }}
      >
        kura
      </span>
    </div>
  );
}

function Mono({ children, size = 30, tracking = 0.06 }: { children: string; size?: number; tracking?: number }) {
  return (
    <span
      style={{
        fontFamily: "RedHatMono",
        fontSize: size,
        letterSpacing: `${tracking}em`,
        whiteSpace: "nowrap",
        textTransform: "uppercase",
        color: TEXT_2,
      }}
    >
      {children}
    </span>
  );
}

/** One cover at a fixed box: the image, or its palette as the no-art recipe. */
function CoverBox({ c, w, h, rot, dashed }: { c: OgCover | undefined; w: number; h: number; rot?: number; dashed?: boolean }) {
  const fill = c && !c.src ? posterFallbackStyle(c.paletteHex) : { background: SURFACE_1 };
  return (
    <div
      style={{
        display: "flex",
        width: w,
        height: h,
        borderRadius: RADIUS,
        overflow: "hidden",
        // Satori rejects `transform: undefined` — omit the key instead.
        ...(rot ? { transform: `rotate(${rot}deg)` } : null),
        // Dark neutral depth only (no glow): the covers sit on the tint.
        boxShadow: "0 24px 48px -18px rgba(0,0,0,0.75)",
        ...fill,
        // Dashed mock affordance for the empty collection (exempt).
        ...(dashed ? { border: "3px dashed rgba(255,255,255,0.18)" } : null),
      }}
    >
      {c?.src && (
        // The radius goes on the <img> too: Satori's overflow clip only rounds
        // it on a rotated box, the upright one came out square. Satori needs a
        // plain <img> (next/image doesn't exist in an ImageResponse).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.src} alt="" width={w} height={h} style={{ objectFit: "cover", borderRadius: RADIUS }} />
      )}
    </div>
  );
}

/**
 * The fan's geometry (`components/kura/fan.tsx`, `G` at lead 225 on a 300 × 243
 * box): front upright and centred, second −10° behind on the left, third +9°
 * behind on the right; a record keeps its 1:1 in every slot. Copied because
 * `G` isn't exported — if the fan changes, change both.
 */
const FAN = {
  w: 300,
  h: 243,
  lead: { cx: 150, cy: 112.5, poster: [150, 225], album: [180, 180] },
  left: { cx: 69.5, cy: 126, rot: -10 },
  right: { cx: 231.5, cy: 126.5, rot: 9 },
  back: { poster: [117, 176], album: [135, 135] },
} as const;

/** Front cover 380 px tall: the whole fan (≈ 507 × 410) keeps ≥ 72 px to the edge. */
function OgFan({ covers, ghost, lead = 380 }: { covers: OgCover[]; ghost: boolean; lead?: number }) {
  const S = lead / 225;
  const order: { c: OgCover | undefined; at: "left" | "right" | "lead" }[] = [
    { c: covers[1], at: "left" },
    { c: covers[2], at: "right" },
    { c: covers[0], at: "lead" },
  ];
  const show = { left: ghost || covers.length >= 2, right: ghost || covers.length >= 3, lead: true };
  return (
    <div style={{ display: "flex", position: "relative", width: FAN.w * S, height: FAN.h * S }}>
      {order.map(({ c, at }) => {
        if (!show[at]) return null;
        const front = at === "lead";
        const album = c ? c.mediaType === "album" : at === "right";
        const [w, h] = front ? (album ? FAN.lead.album : FAN.lead.poster) : album ? FAN.back.album : FAN.back.poster;
        const pos = FAN[at];
        const rot = front ? 0 : (pos as typeof FAN.left).rot;
        return (
          <div
            key={at}
            style={{ display: "flex", position: "absolute", left: (pos.cx - w / 2) * S, top: (pos.cy - h / 2) * S }}
          >
            <CoverBox c={c} w={w * S} h={h * S} rot={rot} dashed={ghost && front} />
          </div>
        );
      })}
    </div>
  );
}

/** The words' column. A plain element, not a fragment: Satori lays a
 *  fragment's children out as the parent's row, not as this column. */
function Words({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{children}</div>;
}

/** The shared frame: tint, lockup top-left, `words` bottom-left, `art` right. */
async function frame(hexes: readonly string[], words: React.ReactNode, art: React.ReactNode) {
  const fonts = await loadOgFonts();
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: background(hexes), color: TEXT, fontFamily: "Hanken" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 580,
          padding: "56px 0 64px 72px",
        }}
      >
        <OgLockup />
        {words}
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 72 }}>{art}</div>
    </div>,
    {
      ...OG_SIZE,
      fonts,
      headers: { "Cache-Control": `public, max-age=${OG_TTL_SECONDS}, s-maxage=${OG_TTL_SECONDS}` },
    },
  );
}

/* ------------------------------------------------------------ collection */

export function collectionOg(input: {
  name: string;
  vibe: string | null;
  /** "@sofi y @mariel". */
  by: string;
  /** "5 TÍTULOS · CINE · ÁLBUMES". */
  kinds: string;
  hexes: readonly string[];
  covers: OgCover[];
  empty: boolean;
}) {
  // Two lines at most in the 508 px column: long names step down to 68.
  const nameSize = input.name.length > 18 ? 68 : 84;
  return frame(
    input.hexes,
    <Words>
      <span style={{ display: "flex", flexWrap: "wrap", fontSize: 32, color: TEXT_2 }}>
        una colección de&nbsp;<span style={{ fontWeight: 600, color: TEXT }}>{input.by}</span>
      </span>
      <span style={{ fontFamily: "Newsreader", fontSize: nameSize, lineHeight: 1.02, display: "block", lineClamp: 2, overflow: "hidden" }}>
        {input.name}
      </span>
      {input.vibe && (
        <span
          style={{
            fontFamily: "Newsreader",
            fontStyle: "italic",
            fontSize: 34,
            lineHeight: 1.2,
            color: TEXT_2,
            display: "block",
            lineClamp: 2,
            overflow: "hidden",
          }}
        >
          {input.vibe}
        </span>
      )}
      {input.kinds && <Mono>{input.kinds}</Mono>}
    </Words>,
    <OgFan covers={input.covers} ghost={input.empty} />,
  );
}

/* --------------------------------------------------------------- profile */

/** The words' column is 580 − 72 of padding = 508 px wide. */
const WORDS_W = 508;
const STATS_TRACKING = 0.04;
/**
 * "1284 COLECCIONES · 9999 SEGUIDORES" must stay ONE line: Red Hat Mono is
 * 0.6 em a glyph (+ tracking), so the size is the largest that fits the
 * column, capped at the Mono's 30 and floored at 20 (≈ 39 characters).
 */
function statsSize(text: string) {
  const perEm = text.length * (0.6 + STATS_TRACKING);
  return Math.max(20, Math.min(30, Math.floor(WORDS_W / perEm)));
}

export function profileOg(input: {
  displayName: string;
  username: string;
  /** "3 COLECCIONES · 12 SEGUIDORES". */
  meta: string;
  hexes: readonly string[];
  /** The fan of the collection that leads the profile (pinned, else newest). */
  covers: OgCover[];
}) {
  const name = (input.displayName || input.username).toLowerCase();
  const seal = input.hexes.length ? sealColors(input.hexes) : { bg: SURFACE_1, fg: TEXT };
  const nameSize = name.length > 18 ? 68 : 84;
  return frame(
    input.hexes,
    <Words>
      {/* The seal (§marca · sello): initials in the wordmark's cut. The photo
          stays on the page — its route is `Cache-Control: private` (F3.11),
          and this image is cached at the edge. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 112,
          height: 112,
          borderRadius: 56,
          background: seal.bg,
          color: seal.fg,
          fontFamily: "Newsreader",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 48,
          letterSpacing: "-0.035em",
          marginBottom: 6,
        }}
      >
        {sealInitials(input.displayName || input.username)}
      </div>
      <span style={{ fontFamily: "Newsreader", fontSize: nameSize, lineHeight: 1.02, display: "block", lineClamp: 2, overflow: "hidden" }}>
        {name}
      </span>
      <span style={{ fontSize: 32, color: TEXT_2 }}>@{input.username}</span>
      {input.meta && (
        <Mono size={statsSize(input.meta)} tracking={STATS_TRACKING}>
          {input.meta}
        </Mono>
      )}
    </Words>,
    input.covers.length ? <OgFan covers={input.covers} ghost={false} /> : <OgFan covers={[]} ghost />,
  );
}

/* ----------------------------------------------------------------- title */

const KIND = { film: "Cine", series: "Serie", album: "Álbum" } as const;

export function titleOg(input: {
  title: string;
  byline: string | null;
  year: number | null;
  cover: OgCover;
  hexes: readonly string[];
}) {
  const album = input.cover.mediaType === "album";
  const [w, h] = album ? [430, 430] : [313, 470];
  const meta = [KIND[input.cover.mediaType], input.year].filter(Boolean).join(" · ");
  const titleSize = input.title.length > 26 ? 68 : 84;
  return frame(
    input.hexes,
    <Words>
      <Mono>{meta}</Mono>
      {/* A work's title is italic (§tipografía). */}
      <span
        style={{
          fontFamily: "Newsreader",
          fontStyle: "italic",
          fontSize: titleSize,
          lineHeight: 1.04,
          display: "block",
          lineClamp: 3,
          overflow: "hidden",
        }}
      >
        {input.title}
      </span>
      {input.byline && (
        <span style={{ fontSize: 34, color: TEXT_2, display: "block", lineClamp: 1, overflow: "hidden" }}>{input.byline}</span>
      )}
    </Words>,
    <CoverBox c={input.cover} w={w} h={h} />,
  );
}
