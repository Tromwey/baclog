"use client";

import { useState, useTransition } from "react";
import { setStatusAction } from "@/app/actions/backlog-item-actions";
import { CrossMediaFeedback } from "@/components/cross-media-feedback";
import { ReactionPicker } from "@/components/reaction-picker";

const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "On my radar",
  in_progress: "In progress",
  completed: "Completed",
};

interface Entry {
  id: string;
  status: string;
  customStatusLabel: string | null;
  reaction: string | null;
  sourceCrossMediaRecId: string | null;
}

export function ItemStatusControls({ entry: initialEntry }: { entry: Entry }) {
  // Local optimistic copy — avoids a full router.refresh() (which re-runs the
  // whole page's data fetch: catalog item + all backlogs + catalog entry) on
  // every tap. The server actions already revalidatePath("/backlogs/[id]") for
  // the OTHER surface that shows this same data; this page updates itself.
  const [entry, setEntry] = useState(initialEntry);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pickStatus(status: "on_my_radar" | "in_progress" | "completed") {
    setError(null);
    startTransition(() =>
      setStatusAction(entry.id, status)
        .then((res) => {
          if ("error" in res) {
            setError("No se pudo actualizar el estado.");
            return;
          }
          setEntry((e) => ({ ...e, status }));
        })
        .catch(() => setError("No se pudo actualizar el estado.")),
    );
  }

  return (
    <div className="mt-6 space-y-3 rounded-[var(--r-lg)] border border-line bg-surface-1 p-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
          Estado
          {entry.status === "custom" && entry.customStatusLabel
            ? ` · ${entry.customStatusLabel}`
            : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["on_my_radar", "in_progress", "completed"] as const).map((s) => (
            <button
              key={s}
              disabled={pending}
              onClick={() => pickStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                entry.status === s
                  ? "bg-accent text-bg"
                  : "bg-surface-2 text-text-2"
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-3">
          Tu reacción
        </p>
        <div className="mt-2">
          <ReactionPicker
            backlogItemId={entry.id}
            reaction={entry.reaction}
            variant="plain"
            onChange={(reaction) => setEntry((e) => ({ ...e, reaction }))}
          />
        </div>
      </div>

      <CrossMediaFeedback
        backlogItemId={entry.id}
        reaction={entry.reaction}
        sourceCrossMediaRecId={entry.sourceCrossMediaRecId}
        variant="mono"
      />
    </div>
  );
}
