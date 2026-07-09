"use client";

import { useState, useTransition } from "react";
import {
  setReactionAction,
  type ItemReaction,
} from "@/app/actions/backlog-item-actions";

const REACTION_LABEL: Record<ItemReaction, string> = {
  disliked: "No me gusta",
  liked: "Me gusta",
  obsessed: "Me obsesiona",
};

/** Per-reaction colored pills (backlog row) vs. a single accent highlight (item detail page). */
const REACTION_TINT: Record<ItemReaction, string> = {
  disliked: "bg-surface-2 text-text-2",
  liked: "bg-emerald-900/60 text-emerald-200",
  obsessed: "bg-fuchsia-900/60 text-fuchsia-200",
};

/**
 * F3.6 — no me gusta / me gusta / me obsesiona. Applies in ANY status (obsession
 * can strike mid-consumption, not just on completion). Shared between the
 * backlog row (item-row.tsx) and the item detail page (item-status-controls.tsx).
 */
export function ReactionPicker({
  backlogItemId,
  reaction,
  onChange,
  variant = "plain",
}: {
  backlogItemId: string;
  reaction: string | null;
  /** Called with the new reaction once the server confirms it. */
  onChange?: (reaction: ItemReaction) => void;
  variant?: "plain" | "tinted";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(next: ItemReaction) {
    setError(null);
    startTransition(() =>
      setReactionAction(backlogItemId, next)
        .then((res) => {
          if ("error" in res) {
            setError("No se pudo guardar tu reacción.");
            return;
          }
          onChange?.(next);
        })
        .catch(() => setError("No se pudo guardar tu reacción.")),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {(["disliked", "liked", "obsessed"] as const).map((r) => (
          <button
            key={r}
            disabled={pending}
            onClick={() => pick(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              reaction === r
                ? variant === "tinted"
                  ? REACTION_TINT[r]
                  : "bg-accent text-bg"
                : "bg-surface-2 text-text-2"
            }`}
          >
            {REACTION_LABEL[r]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
