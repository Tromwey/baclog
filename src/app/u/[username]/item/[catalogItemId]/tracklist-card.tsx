"use client";

import { useState, type ReactNode } from "react";
import { StrokeIcon } from "@/components/ui";
import { CHEVRON_DOWN_PATH } from "@/components/glyph-paths";

/**
 * The album's "Tracklist" row (Revamp UI 06f, 2026-09-03): a glass card —
 * radius 18, 14/16 padding — with the count and running time in mono and a
 * chevron; tapping it unfolds the tracklist itself underneath (the server
 * renders it and hands it over as children, so the list stays a server
 * component). Blur 16 as the mock draws it: this card FLOATS open.
 */
export function TracklistCard({
  trackCount,
  minutes,
  children,
}: {
  trackCount: number;
  minutes: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const meta = [
    `${trackCount} ${trackCount === 1 ? "canción" : "canciones"}`,
    minutes > 0 ? `${minutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-[18px] bg-[var(--glass-bg)] backdrop-blur-[16px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-text">Tracklist</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
            {meta}
          </span>
        </span>
        <StrokeIcon
          d={CHEVRON_DOWN_PATH}
          size={14}
          strokeWidth={2.4}
          className={`text-text-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 [&>section]:mt-0">{children}</div>}
    </div>
  );
}
