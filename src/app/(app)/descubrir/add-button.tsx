"use client";

import { Check, Plus } from "lucide-react";

/**
 * The circular ＋ add control shared by Descubrir's search results and reco
 * rows. Presentational only — each caller wires its own add action (default
 * backlog vs. reco accept) into onClick.
 */
export function AddButton({
  added,
  busy,
  label,
  onClick,
}: {
  added: boolean;
  busy?: boolean;
  /** Item title, for the accessible label. */
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={`Agregar ${label}`}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
        added ? "bg-accent text-bg" : "bg-accent-soft text-accent"
      }`}
    >
      {added ? <Check size={18} /> : <Plus size={18} />}
    </button>
  );
}
