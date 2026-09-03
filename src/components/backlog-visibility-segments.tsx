"use client";

import { useState, useTransition } from "react";
import {
  setBacklogVisibilityAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import { VISIBILITY_STATES, visibilityOf } from "@/modules/backlog/visibility";

/**
 * F3.10.1 — THE three-state visibility control (Privado · Público · Perfil),
 * shared by the profile's escaparate sheet and the backlog zoom's ⋯ menu so
 * the triad renders and behaves identically wherever a backlog is standing.
 *
 * Owns the optimistic write: flips on tap, calls the action, reverts on
 * {error} AND on a rejection (the FollowButton lesson). `onSync` mirrors every
 * local change — including reverts — so a parent keeping derived state (the
 * sheet's live counts) can never drift from what the control shows.
 */

export { VISIBILITY_STATES, visibilityOf };

export function VisibilitySegments({
  backlogId,
  initial,
  onSync,
  className = "",
}: {
  backlogId: string;
  initial: BacklogVisibility;
  onSync?: (next: BacklogVisibility) => void;
  className?: string;
}) {
  const [current, setCurrent] = useState(initial);
  const [, startSave] = useTransition();

  function set(next: BacklogVisibility) {
    if (next === current) return;
    const prev = current;
    setCurrent(next);
    onSync?.(next);
    startSave(async () => {
      try {
        const result = await setBacklogVisibilityAction(backlogId, next);
        if ("error" in result) {
          setCurrent(prev);
          onSync?.(prev);
        }
      } catch {
        setCurrent(prev);
        onSync?.(prev);
      }
    });
  }

  return (
    <span
      className={`flex flex-none gap-1 rounded-full bg-surface-3 p-[3px] ${className}`}
    >
      {VISIBILITY_STATES.map((s) => (
        <button
          key={s.id}
          onClick={() => set(s.id)}
          aria-pressed={current === s.id}
          className={`rounded-full px-2 py-[6px] font-mono text-[8.5px] uppercase tracking-[0.06em] transition-colors ${
            current === s.id
              ? "bg-accent-soft text-accent"
              : "text-text-3 hover:text-text-2"
          }`}
        >
          {s.label}
        </button>
      ))}
    </span>
  );
}
