"use client";

import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import type { ReviewAuthor, ReviewMark } from "@/modules/reviews/types";

/**
 * F3.9 — the element that repeats most, so it's the one that's measured
 * (design "La card, medida"): radius 18 on surface 1, three brightness tiers
 * (body 100%, username 100% at 14px, metadata tertiary) and the reaction mark
 * NEVER rising above the metadata tier. The text always wins the card.
 *
 * Borderless and shadow-free per HANDOFF §7 — cards separate by fill and the
 * 8px gap between them, nothing else.
 */

const DOTS = (
  <svg width="16" height="4" viewBox="0 0 22 6" fill="currentColor" aria-hidden>
    <circle cx="3" cy="3" r="2.5" />
    <circle cx="11" cy="3" r="2.5" />
    <circle cx="19" cy="3" r="2.5" />
  </svg>
);

/**
 * The signal glyph system (HANDOFF §3), shrunk to 10px: the flame is the only
 * thing in the card allowed color, a filled dot is "le gustó" and a hollow one
 * "no le gustó". Both dots stay in the metadata tier so they read out of the
 * corner of the eye instead of announcing themselves.
 */
export function MarkGlyph({ mark }: { mark: ReviewMark }) {
  if (mark === "obsessed") {
    return (
      <svg
        width="10"
        height="10"
        viewBox={GLYPH_VIEWBOX}
        fill="var(--hot)"
        className="flex-none"
        aria-hidden
      >
        <path d={FLAME_PATH} />
      </svg>
    );
  }
  if (mark === "liked") {
    return (
      <span
        aria-hidden
        className="h-[7px] w-[7px] flex-none rounded-full bg-text-2"
      />
    );
  }
  if (mark === "disliked") {
    return (
      <span
        aria-hidden
        className="h-[7px] w-[7px] flex-none rounded-full shadow-[inset_0_0_0_1.5px_var(--text-3)]"
      />
    );
  }
  return null;
}

/** The 30px review-card size of the shared ADN orb — one recipe, no drift. */
export function ReviewAvatar({ author }: { author: ReviewAuthor }) {
  return (
    <AdnAvatar
      hexes={author.avatarHexes}
      initial={author.initial}
      src={author.avatarUrl}
      className="h-[30px] w-[30px] text-[11px]"
    />
  );
}

/**
 * The spoiler treatment: the text is never replaced or boxed, it's blurred in
 * place with the label centered over it, so the card keeps its EXACT height and
 * revealing doesn't move the feed by a pixel — it just comes into focus. Same
 * idea as the aura: light and the lack of it do the work a border would do
 * elsewhere. Once revealed it stays revealed for the session.
 */
export function SpoilerBody({
  body,
  hasSpoiler,
  /** The author never has their own text covered — it protects nobody. */
  alwaysRevealed = false,
  className = "mt-[11px]",
}: {
  body: string;
  hasSpoiler: boolean;
  alwaysRevealed?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!hasSpoiler || alwaysRevealed || revealed) {
    return (
      <p
        className={`${className} text-[14.5px] leading-[1.52] text-pretty text-text`}
      >
        {body}
      </p>
    );
  }
  return (
    <button
      onClick={() => setRevealed(true)}
      className={`${className} relative block w-full text-left`}
    >
      <span className="block select-none text-[14.5px] leading-[1.52] text-text opacity-50 blur-[5.5px] transition-[filter,opacity] duration-[220ms] ease-[var(--ease-out)]">
        {body}
      </span>
      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-2">
        Contiene spoiler · Mostrar
      </span>
    </button>
  );
}

export function ReviewCard({
  body,
  hasSpoiler,
  mark,
  when,
  author,
  markLabel,
  displayName,
  onMenu,
  menuLabel,
  alwaysRevealed = false,
  children,
  className = "",
}: {
  body: string;
  hasSpoiler: boolean;
  mark: ReviewMark;
  when: string;
  author: ReviewAuthor;
  markLabel: string | null;
  /** "Tú" on the viewer's own card, the @handle on everyone else's. */
  displayName: string;
  onMenu?: () => void;
  menuLabel?: string;
  alwaysRevealed?: boolean;
  /** Extra note under the body (private-profile hint, moderation note…). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[18px] bg-surface-1 px-4 pb-4 pt-[15px] ${className}`}>
      <div className="flex items-center gap-[10px]">
        <ReviewAvatar author={author} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text">
            {displayName}
          </div>
          <div className="mt-[2px] flex items-center gap-[6px]">
            <MarkGlyph mark={mark} />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
              {markLabel ? `${markLabel} · ${when}` : when}
            </span>
          </div>
        </div>
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label={menuLabel ?? "Opciones"}
            className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-text-3"
          >
            {DOTS}
          </button>
        )}
      </div>
      <SpoilerBody
        body={body}
        hasSpoiler={hasSpoiler}
        alwaysRevealed={alwaysRevealed}
      />
      {children}
    </div>
  );
}

/** The card collapses in place after you report it — the feed never jumps. */
export function ReportedCard() {
  return (
    <div className="rounded-[18px] bg-surface-1 px-4 py-[15px]">
      <div className="flex items-center gap-[10px]">
        <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-text-3" />
        <span className="text-[13.5px] text-text-2">Gracias. Lo revisamos.</span>
      </div>
    </div>
  );
}
