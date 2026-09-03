"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A film/series synopsis, clamped.
 *
 * TMDB overviews have no length contract: most are two or three lines, and
 * then something like «The Wild Soccer Bunch 4» arrives with a nine-line plot
 * summary that pushes the reaction row, the reviews and everything else off
 * the screen. The page's shape shouldn't depend on how talkative a
 * distributor's copywriter was.
 *
 * So it clamps to three lines and nothing is ever cut for good — the rest is
 * one tap away. The toggle only appears when the text ACTUALLY overflows,
 * measured after mount rather than guessed from a character count. Server
 * render is the clamped paragraph with no toggle, so nothing jumps on
 * hydration — the affordance just appears.
 *
 * Revamp UI (2026-09-03): the mock's paragraph — 15px/1.5, text-2,
 * text-pretty, left-aligned — is the default; the caller may override.
 */
export function Synopsis({
  text,
  className = "text-[15px] leading-[1.5] text-text-2",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure against the CLAMPED box, so re-measuring while expanded (a font
    // load, a resize) can't decide the text suddenly fits.
    if (!expanded) setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [text, expanded]);

  return (
    <div className="flex flex-col gap-2">
      <p
        ref={ref}
        className={`${className} text-pretty ${expanded ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3 transition-colors hover:text-text-2"
        >
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  );
}
