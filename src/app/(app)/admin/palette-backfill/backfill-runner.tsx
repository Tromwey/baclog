"use client";

import { useState } from "react";
import {
  getPaletteBackfillTargetsAction,
  updateItemPaletteAction,
} from "@/app/actions/palette-backfill-actions";
import { extractPalette } from "@/modules/cards/palette";

type Status = "idle" | "running" | "done" | "forbidden";

export function BackfillRunner() {
  const [status, setStatus] = useState<Status>("idle");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);

  async function run() {
    setStatus("running");
    setDone(0);
    setFailed(0);

    const targets = await getPaletteBackfillTargetsAction();
    if ("error" in targets) {
      setStatus("forbidden");
      return;
    }

    setTotal(targets.length);
    let failCount = 0;

    for (const target of targets) {
      const hexes = await extractPalette(target.posterUrl);
      const res = await updateItemPaletteAction(target.backlogItemId, hexes);
      if ("error" in res) failCount++;
      setDone((d) => d + 1);
    }

    setFailed(failCount);
    setStatus("done");
  }

  if (status === "forbidden") {
    return <p className="mt-6 text-sm text-red-400">No autorizado.</p>;
  }

  return (
    <div className="mt-6">
      <button
        onClick={run}
        disabled={status === "running"}
        className="rounded-full bg-accent px-4 py-3 font-semibold text-bg disabled:opacity-40"
      >
        {status === "running" ? "Corriendo…" : "Iniciar backfill"}
      </button>

      {status !== "idle" && (
        <p className="mt-3 text-sm text-text-2">
          {done} / {total} procesados
          {status === "done" &&
            (failed > 0 ? ` — ${failed} fallaron` : " — listo ✓")}
        </p>
      )}
    </div>
  );
}
