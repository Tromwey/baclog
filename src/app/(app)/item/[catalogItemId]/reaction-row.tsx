"use client";

import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";
import { StateGlyph } from "@/components/ui/state-glyph";
import { useItemReaction } from "./reaction-state";

/**
 * The reaction row (Revamp UI 06): one segmented track, three INDEPENDENT
 * toggles — Me gustó (verdict), Obsesión (flag), Completo (status). Several
 * can be lit at once; the track only highlights each active key.
 *
 * "No me gustó" is not here — it lives inside the Completar sheet (08), as
 * the mock has it. Completo never writes directly: it opens the sheet, and
 * when the title is already complete the sheet opens pre-filled so the
 * review can be edited.
 *
 * On a title that isn't in the library, the first tap adds it (one backlog →
 * straight in; several → the picker) and then applies the reaction.
 */
export function ReactionRow() {
  const {
    verdict,
    obsessed,
    completed,
    mutateVerdict,
    mutateObsessed,
    ensureInLibrary,
    openComplete,
  } = useItemReaction();
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const values = [
    verdict === "liked" ? "liked" : null,
    obsessed ? "obsessed" : null,
    completed ? "done" : null,
  ].filter((v): v is string => v !== null);

  function onSelect(key: string) {
    setError(null);
    start(async () => {
      const ok = await ensureInLibrary();
      if (!ok) return;
      if (key === "done") {
        openComplete();
        return;
      }
      const saved =
        key === "liked"
          ? await mutateVerdict(verdict === "liked" ? null : "liked")
          : await mutateObsessed(!obsessed);
      if (!saved) setError("No se pudo guardar tu reacción.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Segmented
        variant="actions"
        ariaLabel="Tu reacción"
        values={values}
        onSelect={onSelect}
        segments={[
          { key: "liked", label: "Me gustó", icon: <StateGlyph kind="liked" size={11} /> },
          { key: "obsessed", label: "Obsesión", icon: <StateGlyph kind="obsessed" size={10} /> },
          { key: "done", label: "Completo", icon: <StateGlyph kind="done" size={11} /> },
        ]}
      />
      {error && (
        <p className="px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-hot">
          {error}
        </p>
      )}
    </div>
  );
}
