"use client";

import { useState } from "react";
import type { AlbumTrack } from "@/modules/catalog/itunes";
import { Tracklist } from "@/components/tracklist";
import { StrokeIcon } from "@/components/ui/stroke-icon";
import { CHEVRON_DOWN_PATH } from "@/components/glyph-paths";
import { plural } from "@/lib/plural";

/**
 * The album's tracklist row (Revamp UI 06e): a glass card — "Tracklist" with
 * the count and the running time in mono under it, a chevron on the right —
 * that expands in place to the numbered list. Total minutes only when iTunes
 * gave durations; before release the count reads "3 de 15 canciones" and the
 * expanded list keeps its "N canciones más el 14 de agosto" divider.
 */
export function TracklistCard({
  tracks,
  totalCount,
  pendingLabel,
}: {
  tracks: AlbumTrack[];
  totalCount?: number;
  pendingLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (tracks.length === 0) return null;

  const total = totalCount && totalCount > tracks.length ? totalCount : null;
  const hasDurations = tracks.some((t) => t.durationMs != null);
  const minutes = Math.round(
    tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0) / 60_000,
  );
  const count = total
    ? `${tracks.length} de ${total} canciones`
    : `${tracks.length} ${plural(tracks.length, "canción", "canciones")}`;
  const meta = hasDurations && minutes > 0 ? `${count} · ${minutes} min` : count;

  return (
    <div className="rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5 backdrop-blur-[16px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex flex-1 flex-col gap-[2px]">
          <span className="text-[14px] font-semibold text-text">Tracklist</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
            {meta}
          </span>
        </span>
        <StrokeIcon
          d={CHEVRON_DOWN_PATH}
          size={14}
          strokeWidth={2.4}
          className={`flex-none text-text-3 transition-transform duration-[var(--dur-base)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="bl-rise-soft mt-2">
          <Tracklist
            tracks={tracks}
            totalCount={totalCount}
            pendingLabel={pendingLabel}
            hideHeader
          />
        </div>
      )}
    </div>
  );
}
