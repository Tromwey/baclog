import type { CSSProperties, ReactNode } from "react";
import type { MediaType } from "@/modules/catalog/types";
import { rgba } from "@/lib/color";
import { StateGlyph, type StateKind } from "@/components/ui/state-glyph";

/**
 * A cover as the mock draws it (Revamp UI, 2026-09-03): the poster itself, a
 * dark depth shadow with a 1px inner highlight, and — in its top-left corner —
 * the title's state as a glyph (never a dot) or the "faltan 12 d" wait pill.
 * Optionally the title printed over a bottom scrim in Instrument Serif.
 *
 * The CALLER sizes it (`className`: `w-[104px] h-[139px]`, `h-[150px]
 * aspect-[3/4]`, …) — the mock uses six different sizes of the same tile.
 * Without art the tile paints the mock's `poster()` recipe from the palette
 * (a radial highlight over a 160° two-hex gradient), so a strip never shows a
 * hole. Server-safe (no hooks); wrap in a Link for navigation.
 *
 * `done` dims the whole tile to .55 (the backlog grid's completed items).
 */
export function posterFallbackStyle(paletteHex: readonly string[] | null | undefined): CSSProperties {
  const a = paletteHex?.[0] ?? "#2a2a30";
  const b = paletteHex?.[1] ?? "#141417";
  return {
    background: `radial-gradient(90% 70% at 30% 20%, ${rgba(a, 0.55)} 0%, ${rgba(a, 0)} 70%), linear-gradient(160deg, ${a} 0%, ${b} 100%)`,
  };
}

/** The mock's native aspect per kind: albums square, video 3:4. */
export function coverAspect(mediaType: MediaType): string {
  return mediaType === "album" ? "aspect-square" : "aspect-[3/4]";
}

export const COVER_SHADOW =
  "shadow-[0_16px_36px_-12px_rgba(0,0,0,.7)]";

export function CoverTile({
  posterUrl,
  paletteHex,
  alt = "",
  state = null,
  wait = null,
  waitAt = "top",
  title,
  done = false,
  radius = "rounded-[12px]",
  className = "",
  children,
}: {
  posterUrl: string | null;
  paletteHex?: readonly string[] | null;
  alt?: string;
  /** The corner glyph. */
  state?: StateKind | null;
  /** The "faltan 12 d" pill; wins over `state`. */
  wait?: string | null;
  waitAt?: "top" | "bottom";
  /** Printed over a bottom scrim, one line, serif italic. */
  title?: string;
  done?: boolean;
  radius?: string;
  className?: string;
  /** Anything else pinned over the art (a grip, a check badge). */
  children?: ReactNode;
}) {
  return (
    <span
      className={`relative block flex-none overflow-hidden ${radius} ${COVER_SHADOW} ${className}`}
      style={{
        ...(posterUrl ? undefined : posterFallbackStyle(paletteHex)),
        opacity: done ? 0.55 : undefined,
      }}
    >
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
        <img
          src={posterUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {/* The 1px inner highlight the mock gives every cover (inset shadow on
          the box, drawn OVER the art so it actually shows). */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${radius} shadow-[inset_0_1px_0_rgba(255,255,255,.16)]`}
      />
      {wait ? (
        <span
          className={`absolute left-1.5 ${
            waitAt === "top" ? "top-1.5" : "bottom-1.5"
          } whitespace-nowrap rounded-full bg-[rgba(11,11,13,.7)] px-[7px] py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-accent`}
        >
          {wait}
        </span>
      ) : state ? (
        <span className="absolute left-1.5 top-1.5 flex drop-shadow-[0_1px_3px_rgba(0,0,0,.6)]">
          <StateGlyph kind={state} size={13} />
        </span>
      ) : null}
      {title && (
        <span
          className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-b from-transparent to-black/60 px-2.5 pb-2 pt-[22px] font-serif text-[14px] italic leading-[1.1] text-text"
          style={{ background: "linear-gradient(transparent, rgba(0,0,0,.55))" }}
        >
          {title}
        </span>
      )}
      {children}
    </span>
  );
}
