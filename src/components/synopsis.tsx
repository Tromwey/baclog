"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A film/series synopsis, clamped.
 *
 * TMDB overviews have no length contract: most are two or three lines, and
 * then something like «The Wild Soccer Bunch 4» arrives with a nine-line plot
 * summary that pushes the reaction gesture, the reviews and the action bar off
 * the screen entirely. The page's shape shouldn't depend on how talkative a
 * distributor's copywriter was.
 *
 * So it clamps to four lines and nothing is ever cut for good — the rest is one
 * tap away. The toggle only appears when the text ACTUALLY overflows, measured
 * after mount rather than guessed from a character count: `max-w-[34ch]` is a
 * width in zero-widths, and real Spanish prose wraps nowhere near it. Server
 * render is the clamped paragraph with no toggle, so nothing jumps on
 * hydration — the affordance just appears.
 */
export function Synopsis({
  text,
  className = "",
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
    <>
      <p
        ref={ref}
        className={`${className} ${expanded ? "" : "line-clamp-4"}`}
      >
        {text}
      </p>
      {overflows && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto mt-2 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-3 transition-colors hover:text-text-2"
        >
          {expanded ? "Leer menos" : "Leer más"}
        </button>
      )}
    </>
  );
}
