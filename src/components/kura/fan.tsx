import type { CSSProperties } from "react";
import { posterFallbackStyle } from "@/components/cover-tile";
import type { FanCover } from "@/modules/backlog/fan";
import { KIcon } from "./icons";

/**
 * The fan (Colecciones formalizado · "El abanico es la colección"): three
 * covers with no box — the front one upright and centred, the second tilted
 * −10° behind on the left, the third +9° behind on the right — standing on a
 * soft floor shadow. The frames draw it at one geometry and scale it from 225
 * (a collection's header) down to 22 (a pill): `lead` is the height of the
 * front cover and everything else follows it.
 *
 * Each slot keeps its title's native form (§forma): a poster 2:3, a record
 * 1:1 — a record in front is 180×180 where a poster is 150×225, behind it's
 * 135×135 where a poster is 117×176, every slot on the same centre. A missing
 * title (a collection of one or two) is an empty `--s1` slot; `ghost` draws
 * all three empty with the dashed "+" in front (the empty states, 6a/6b/6c).
 * No art = the palette recipe (`posterFallbackStyle`).
 *
 * Server-safe (no hooks); the caller wraps it in a link or button.
 */

/** The frames' geometry at lead = 225, on a 300 × 243 box. */
const G = {
  w: 300,
  h: 243,
  lead: { cx: 150, cy: 112.5, poster: [150, 225], album: [180, 180] },
  left: { cx: 69.5, cy: 126, rot: -10 },
  right: { cx: 231.5, cy: 126.5, rot: 9 },
  back: { poster: [117, 176], album: [135, 135] },
} as const;

export function fanBox(lead: number): { width: number; height: number } {
  const s = lead / 225;
  return { width: Math.round(G.w * s), height: Math.round(Math.max(G.h * s, lead + 18 * Math.min(1, s * 2.3))) };
}

export function Fan({
  covers,
  lead,
  ghost = false,
  label,
  className = "",
  style,
}: {
  covers: readonly FanCover[];
  /** Height of the front cover: 225 header · 186 profile · 99 grid · 51 row · 22 pill. */
  lead: number;
  ghost?: boolean;
  /** Accessible name ("Portadas de verano 2026"); omitted = decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const s = lead / 225;
  const { width, height } = fanBox(lead);
  const radius = s >= 0.5 ? 14 : s >= 0.35 ? 10 : s >= 0.18 ? 7 : 4;
  const shadow =
    s >= 0.35
      ? "var(--sh-cover)"
      : s >= 0.18
        ? "0 10px 18px -8px rgba(0,0,0,.9)"
        : "0 3px 6px -3px rgba(0,0,0,.9)";
  const floorW = 174 * s + 70 * (1 - s);
  const slots = [covers[1], covers[2], covers[0]] as const;

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`relative block flex-none ${className}`}
      style={{ width, height, ...style }}
    >
      {s >= 0.35 && (
        <span
          className="absolute bottom-0 rounded-[50%]"
          style={{
            left: (width - floorW) / 2,
            width: floorW,
            height: Math.max(10, 24 * s),
            background: "radial-gradient(closest-side, rgba(0,0,0,.55), rgba(0,0,0,0))",
          }}
        />
      )}
      {slots.map((c, i) => {
        const front = i === 2;
        const at = front ? G.lead : i === 0 ? G.left : G.right;
        const album = c ? c.mediaType === "album" : !front && i === 1;
        const [w, h] = front ? (album ? G.lead.album : G.lead.poster) : album ? G.back.album : G.back.poster;
        const rot = front ? 0 : (at as typeof G.left).rot;
        const empty = ghost || !c;
        return (
          <span
            key={i}
            className="absolute overflow-hidden bg-surface-1"
            style={{
              left: (at.cx - w / 2) * s,
              top: (at.cy - h / 2) * s,
              width: w * s,
              height: h * s,
              borderRadius: radius,
              transform: rot ? `rotate(${rot}deg)` : undefined,
              boxShadow: shadow,
              ...(empty ? null : c.posterUrl ? null : posterFallbackStyle(c.paletteHex)),
            }}
          >
            {!empty && c.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
              <img
                src={c.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {ghost && front && (
              // Dashed mock affordance (exempt from the borderless rule).
              <span
                className="absolute inset-0 flex items-center justify-center border-[1.5px] border-dashed border-white/[0.18] text-text-2"
                style={{ borderRadius: radius }}
              >
                {lead >= 60 && <KIcon name="plus" size={Math.round(Math.max(18, 26 * s))} />}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
