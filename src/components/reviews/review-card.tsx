"use client";

import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { StateGlyph } from "@/components/ui/state-glyph";
import type { ReviewAuthor, ReviewMark } from "@/modules/reviews/types";

/**
 * F3.9's review card, redrawn for the Revamp UI (2026-09-03) — the element
 * that repeats most, so it's measured from the mock: a glass card (radius 18,
 * the app's borderless glass fill, 14/16 padding, 10 gap), a 22px ADN orb with
 * the initial, the @handle at 13/600, the author's reaction as a GLYPH beside
 * it (flame · thumb · flipped thumb — never a dot), the date right-aligned in
 * mono, and the body at 15/1.5. The text always wins the card.
 *
 * Borderless and shadow-free per HANDOFF §7 — cards separate by fill and the
 * gap between them, nothing else.
 */

const DOTS = (
  <svg width="16" height="4" viewBox="0 0 22 6" fill="currentColor" aria-hidden>
    <circle cx="3" cy="3" r="2.5" />
    <circle cx="11" cy="3" r="2.5" />
    <circle cx="19" cy="3" r="2.5" />
  </svg>
);

/** The author's reaction, as the state glyph system draws it. */
export function MarkGlyph({ mark }: { mark: ReviewMark }) {
  if (!mark) return null;
  return <StateGlyph kind={mark} />;
}

/** The 22px review-card size of the shared ADN orb — one recipe, no drift. */
export function ReviewAvatar({ author }: { author: ReviewAuthor }) {
  return (
    <AdnAvatar
      hexes={author.avatarHexes}
      initial={author.initial}
      src={author.avatarUrl}
      className="h-[22px] w-[22px] text-[10.5px]"
    />
  );
}

/**
 * The spoiler treatment: the text is never replaced or boxed, it's blurred in
 * place (6px, .4) with a glass pill "Contiene spoiler · Mostrar" centered over
 * it, so the card keeps its EXACT height and revealing doesn't move the page
 * by a pixel — it just comes into focus. Once revealed it stays revealed for
 * the session.
 */
export function SpoilerBody({
  body,
  hasSpoiler,
  /** The author never has their own text covered — it protects nobody. */
  alwaysRevealed = false,
  className = "",
}: {
  body: string;
  hasSpoiler: boolean;
  alwaysRevealed?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  if (!hasSpoiler || alwaysRevealed || revealed) {
    return (
      <p className={`${className} text-[15px] leading-[1.5] text-pretty text-text`}>
        {body}
      </p>
    );
  }
  return (
    <button
      onClick={() => setRevealed(true)}
      className={`${className} relative block w-full text-left`}
    >
      <span className="block select-none text-[15px] leading-[1.5] text-text opacity-40 blur-[6px] transition-[filter,opacity] duration-[220ms] ease-[var(--ease-out)]">
        {body}
      </span>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[rgba(20,20,26,.6)] px-3 py-[7px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text">
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
  /** Kept for callers; the mock shows the reaction as a glyph only. */
  markLabel?: string | null;
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
    <div
      className={`flex flex-col gap-2.5 rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5 ${className}`}
    >
      <div className="flex items-center gap-2">
        <ReviewAvatar author={author} />
        <span className="truncate text-[13px] font-semibold text-text">
          {displayName}
        </span>
        <span className="flex items-center">
          <MarkGlyph mark={mark} />
        </span>
        <span className="ml-auto flex-none font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
          {when}
        </span>
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label={menuLabel ?? "Opciones"}
            className="-mr-2 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-text-3"
          >
            {DOTS}
          </button>
        )}
      </div>
      <SpoilerBody body={body} hasSpoiler={hasSpoiler} alwaysRevealed={alwaysRevealed} />
      {children}
    </div>
  );
}

/** The card collapses in place after you report it — the page never jumps. */
export function ReportedCard() {
  return (
    <div className="rounded-[18px] bg-[var(--glass-bg)] px-4 py-[15px]">
      <div className="flex items-center gap-[10px]">
        <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-text-3" />
        <span className="text-[13.5px] text-text-2">Gracias. Lo revisamos.</span>
      </div>
    </div>
  );
}
