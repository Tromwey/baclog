"use client";

import { useState } from "react";
import { Glyph, Seal } from "@/components/kura/components";
import type { ReviewAuthor, ReviewMark } from "@/modules/reviews/types";

/**
 * F3.9's review card in Kura (24a · reseñas, 2026-09-24): a `--s1` card,
 * radius 18, padding 18, the author's seal (32, or their photo) beside the
 * @handle at 15/500 and their reaction as a 14 px glyph (flame · thumb —
 * never a dot), the date right-aligned in mono, and the body at 15/1.55. The
 * text always wins the card. Shared by the ficha and the public /u pages —
 * props unchanged.
 *
 * Borderless and shadow-free — cards separate by fill and the gap between
 * them, nothing else. A "no me gustó" has no glyph in Kura: it isn't shown.
 */

const DOTS = (
  <svg width="16" height="4" viewBox="0 0 22 6" fill="currentColor" aria-hidden>
    <circle cx="3" cy="3" r="2.5" />
    <circle cx="11" cy="3" r="2.5" />
    <circle cx="19" cy="3" r="2.5" />
  </svg>
);

/** The author's reaction, in the Kura glyph vocabulary (dislike → nothing). */
export function MarkGlyph({ mark, size = 11 }: { mark: ReviewMark; size?: number }) {
  if (mark === "obsessed") return <Glyph kind="obsessed" size={size} />;
  if (mark === "liked") return <Glyph kind="liked" size={size} />;
  return null;
}

/** The review card's seal: the author's photo, or their initials on their ADN. */
export function ReviewAvatar({ author, size = 32 }: { author: ReviewAuthor; size?: number }) {
  return (
    <Seal
      name={author.username || author.initial}
      hexes={author.avatarHexes}
      src={author.avatarUrl}
      size={size}
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
      <p className={`${className} text-[15px] leading-[1.55] text-pretty text-text`}>
        {body}
      </p>
    );
  }
  return (
    <button
      onClick={() => setRevealed(true)}
      className={`${className} relative block w-full text-left transition-opacity active:opacity-70`}
    >
      <span className="block select-none text-[15px] leading-[1.55] text-text opacity-40 blur-[6px] transition-[filter,opacity] duration-[220ms] ease-[var(--ease-out)]">
        {body}
      </span>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[var(--glass-bg)] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text">
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
      className={`flex flex-col gap-3 rounded-[var(--r-surface)] bg-surface-1 p-[18px] ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <ReviewAvatar author={author} />
        <span className="min-w-0 truncate text-[15px] font-medium text-text">
          {displayName}
        </span>
        <span className="flex flex-none items-center">
          <MarkGlyph mark={mark} size={14} />
        </span>
        <span className="ml-auto flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
          {when}
        </span>
        {onMenu && (
          <button
            onClick={onMenu}
            aria-label={menuLabel ?? "Opciones"}
            className="-my-2 -mr-2.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-2 bl-press-sm"
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
    <div className="rounded-[var(--r-surface)] bg-surface-1 px-[18px] py-4">
      <span className="text-[15px] text-text-2">Gracias. La revisamos.</span>
    </div>
  );
}
