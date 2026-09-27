import { ImageResponse } from "next/og";
import { posterFallbackStyle } from "@/components/cover-tile";
import { BG, tintEnds } from "@/components/kura/tint";
import {
  byManualOrder,
  fanHexes,
  fanOf,
  formatsLine,
  joinNames,
} from "@/modules/backlog/fan";
import { getPublicBacklog } from "@/modules/backlog/public";
import { coverDataUri, loadOgFonts } from "@/lib/og";

/**
 * The link preview of a shared collection (WhatsApp, iMessage, X…): 1200×630,
 * the collection as its own page shows it — the feed gradient of its fan's
 * palette, the fan of up to three covers, the name in Newsreader, "una
 * colección de @handle", the formats line in mono and the "kura" wordmark.
 *
 * GATES — the SAME read as the page (`getPublicBacklog`: owner public + handle
 * + `backlog.is_public`, public-safe field list). A private or nonexistent
 * collection is a bare 404, identical for both: the page itself already 404s
 * both identically, so a 404 here reveals nothing the page doesn't, and a
 * generic "kura" image would only answer 200 for ids that don't exist.
 *
 * CACHE — dynamic render (no ISR: a stale-while-revalidate cache would keep
 * serving the old image after the collection went private), with an explicit
 * 5-minute shared TTL (`s-maxage=300`, no SWR) so a crawler burst on a fresh
 * share doesn't re-render per hit. That is the privacy window of the
 * preview: at most ~5 minutes after "Privada" our edge stops serving it (what
 * a messaging app already copied into a chat is out of our hands). The 404 is
 * `no-store` so a collection made public previews at once.
 */

export const dynamic = "force-dynamic";
export const alt = "Una colección en kura";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TTL_SECONDS = 300;
const TEXT = "#f4f3ee";
const TEXT_2 = "#b9b8c2";
const SURFACE_1 = "#141417";

/**
 * The fan's geometry (`components/kura/fan.tsx`, `G` at lead 225 on a 300 × 243
 * box): front upright and centred, second −10° behind on the left, third +9°
 * behind on the right; a record keeps its 1:1 in every slot. Scaled by `s`.
 */
const FAN = {
  w: 300,
  h: 243,
  lead: { cx: 150, cy: 112.5, poster: [150, 225], album: [180, 180] },
  left: { cx: 69.5, cy: 126, rot: -10 },
  right: { cx: 231.5, cy: 126.5, rot: 9 },
  back: { poster: [117, 176], album: [135, 135] },
} as const;
/** Front cover 380 px tall: the whole fan (≈ 507 × 410, the rotated right
 *  slot included) sits inside the right half with ≥ 72 px to the edge — the
 *  same margin as the text — so a preview that crops the sides (WhatsApp)
 *  doesn't clip it (critique 2026-09-27: at 420 the right cover touched). */
const LEAD = 380;
const S = LEAD / 225;
const RADIUS = 22;

type Slot = {
  mediaType: "film" | "series" | "album";
  paletteHex: readonly string[] | null;
  src: string | null;
};

function FanImage({ covers, ghost }: { covers: Slot[]; ghost: boolean }) {
  // Painted back to front: left, right, then the front on top (as fan.tsx).
  const order: { c: Slot | undefined; at: "left" | "right" | "lead" }[] = [
    { c: covers[1], at: "left" },
    { c: covers[2], at: "right" },
    { c: covers[0], at: "lead" },
  ];
  const show = {
    left: ghost || covers.length >= 2,
    right: ghost || covers.length >= 3,
    lead: true,
  };
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: FAN.w * S,
        height: FAN.h * S,
      }}
    >
      {order.map(({ c, at }) => {
        if (!show[at]) return null;
        const front = at === "lead";
        const album = c ? c.mediaType === "album" : at === "right";
        const [w, h] = front
          ? album
            ? FAN.lead.album
            : FAN.lead.poster
          : album
            ? FAN.back.album
            : FAN.back.poster;
        const pos = FAN[at];
        const rot = front ? 0 : (pos as typeof FAN.left).rot;
        const fill =
          c && !c.src
            ? posterFallbackStyle(c.paletteHex)
            : { background: SURFACE_1 };
        return (
          <div
            key={at}
            style={{
              display: "flex",
              position: "absolute",
              left: (pos.cx - w / 2) * S,
              top: (pos.cy - h / 2) * S,
              width: w * S,
              height: h * S,
              borderRadius: RADIUS,
              overflow: "hidden",
              // Satori rejects `transform: undefined` — omit the key instead.
              ...(rot ? { transform: `rotate(${rot}deg)` } : null),
              // Dark neutral depth only (no glow): the covers sit on the tint.
              boxShadow: "0 24px 48px -18px rgba(0,0,0,0.75)",
              ...fill,
              // Dashed mock affordance for the empty collection (exempt).
              ...(ghost && front
                ? { border: "3px dashed rgba(255,255,255,0.18)" }
                : null),
            }}
          >
            {c?.src && (
              // The radius goes on the <img> too: Satori's overflow clip only
              // rounds it on a rotated slot, the upright front came out square.
              <img
                src={c.src}
                alt=""
                width={w * S}
                height={h * S}
                style={{ objectFit: "cover", borderRadius: RADIUS }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}) {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const ordered = [...data.items].sort(byManualOrder);
  const fan = fanOf(ordered, data.coverCatalogItemId);
  const hexes = fanHexes(fan, ordered);
  const [top, bottom] = tintEnds(hexes);
  const count = ordered.length;
  // Founder (2026-09-27) dropped the count only from the credits line above
  // 10a/10b's format pills — the public preview's "N TÍTULOS · FORMATOS" is
  // unrelated and stays.
  const formats = formatsLine([
    ...new Set(ordered.map((i) => i.mediaType)),
  ]).replaceAll(", ", " · ");
  const kinds = `${count} ${count === 1 ? "TÍTULO" : "TÍTULOS"}${formats ? ` · ${formats}` : ""}`;
  const by = joinNames([
    `@${username}`,
    ...data.collaborators.flatMap((c) =>
      c.username ? [`@${c.username}`] : [],
    ),
  ]);

  const [fonts, ...srcs] = await Promise.all([
    loadOgFonts(),
    ...fan.map((c) => coverDataUri(c.posterUrl)),
  ]);
  const covers: Slot[] = fan.map((c, i) => ({
    mediaType: c.mediaType,
    paletteHex: c.paletteHex ?? null,
    src: srcs[i] ?? null,
  }));

  // Sized for the THUMBNAIL (critique 2026-09-27): iMessage/WhatsApp show
  // this at ~300 px wide (÷ 4), so the name stays ≥ 68 px and every meta line
  // ≥ 30 px — at 20–26 px they came out 6 px tall and unreadable.
  const nameSize = data.backlogName.length > 28 ? 68 : 84;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: hexes[0]
          ? `linear-gradient(168deg, ${top} 0%, ${bottom} 100%)`
          : BG,
        color: TEXT,
        fontFamily: "Hanken",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 560,
          padding: "64px 0 64px 72px",
        }}
      >
        <span
          style={{
            fontFamily: "Newsreader",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 56,
            letterSpacing: "-0.035em",
            lineHeight: 1,
          }}
        >
          kura
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ display: "flex", flexWrap: "wrap", fontSize: 32, color: TEXT_2 }}>
            una colección de&nbsp;
            <span style={{ fontWeight: 600, color: TEXT }}>{by}</span>
          </span>
          <span
            style={{
              fontFamily: "Newsreader",
              fontSize: nameSize,
              lineHeight: 1.02,
              lineClamp: 2,
              overflow: "hidden",
            }}
          >
            {data.backlogName}
          </span>
          {data.vibe && (
            <span
              style={{
                fontFamily: "Newsreader",
                fontStyle: "italic",
                fontSize: 34,
                lineHeight: 1.2,
                color: TEXT_2,
                lineClamp: 2,
                overflow: "hidden",
              }}
            >
              {data.vibe}
            </span>
          )}
          {kinds && (
            <span
              style={{
                fontFamily: "RedHatMono",
                fontSize: 30,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: TEXT_2,
              }}
            >
              {kinds}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingRight: 72,
        }}
      >
        <FanImage covers={covers} ghost={count === 0} />
      </div>
    </div>,
    {
      ...size,
      fonts,
      headers: {
        "Cache-Control": `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}`,
      },
    },
  );
}
