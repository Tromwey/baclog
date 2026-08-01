"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { plural } from "@/lib/plural";

/** Rows shown before the list asks permission to grow. */
const VISIBLE = 5;

export interface BacklogChoice {
  id: string;
  name: string;
}

/**
 * The backlog list inside a sheet — shared by "Agregar a…" (Descubrir) and
 * "¿A cuál backlog?" (item detail), which had drifted into two different row
 * treatments and two different overflow behaviours (one clipped at 40vh
 * mid-row, the other grew unbounded until it ran off screen).
 *
 * Overflow rule: at 5 or fewer, the whole list shows and NOTHING is announced —
 * that's every new account, and a control there would be noise. Past 5, the
 * extra rows hide behind one quiet mono row that says how many there are
 * ("Ver los 4 restantes" decides the tap for you in a way "Ver más" can't).
 * Expanding scrolls in place rather than growing the sheet off-screen.
 *
 * No search field, deliberately: typing only beats looking once the list is
 * long enough that scanning fails, which at these sizes it isn't. Revisit when
 * users routinely pass ~12 backlogs — and put the filter in the EXPANDED state,
 * not the collapsed one.
 */
export function BacklogChoiceList({
  options,
  selectedId,
  disabled,
  onPick,
}: {
  options: BacklogChoice[];
  /** Marked with a ✓ and always kept visible, even outside the first rows. */
  selectedId?: string | null;
  disabled?: boolean;
  onPick: (choice: BacklogChoice) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // The selected target leads, so the sheet can never contradict the chip that
  // opened it ("Agregando a Corea" with Corea nowhere in the list).
  const ordered = selectedId
    ? [
        ...options.filter((b) => b.id === selectedId),
        ...options.filter((b) => b.id !== selectedId),
      ]
    : options;

  const overflow = ordered.length - VISIBLE;
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE);

  return (
    <>
      <div
        className={`mt-3 space-y-2 ${
          expanded ? "max-h-[46vh] overflow-y-auto" : ""
        }`}
      >
        {visible.map((b) => {
          const on = selectedId === b.id;
          return (
            <button
              key={b.id}
              disabled={disabled}
              onClick={() => onPick(b)}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--r-md)] px-4 py-3.5 text-left transition-colors disabled:opacity-40 ${
                on
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-2 text-text hover:bg-surface-3"
              }`}
            >
              <span className="truncate font-medium">{b.name}</span>
              {on && <Check size={16} className="shrink-0" />}
            </button>
          );
        })}
      </div>

      {overflow > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2.5 flex w-full items-center gap-2.5 px-1 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-text-2 transition-colors hover:text-text"
        >
          <span aria-hidden className="text-[13px] leading-none text-accent">
            ↓
          </span>
          Ver {plural(overflow, "el", "los")} {overflow}{" "}
          {plural(overflow, "restante", "restantes")}
        </button>
      )}
    </>
  );
}
