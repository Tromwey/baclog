"use client";

import { useState } from "react";
import {
  getPaletteBackfillTargetsAction,
  updateItemPaletteAction,
} from "@/app/actions/palette-backfill-actions";
import { extractPalette } from "@/modules/cards/palette";
import { attempt, ATTEMPT_UNREACHED } from "@/components/kura/attempt";

type Status = "idle" | "running" | "done" | "forbidden" | "interrupted";

export function BackfillRunner() {
  const [status, setStatus] = useState<Status>("idle");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [skipped, setSkipped] = useState(0);

  async function run() {
    setStatus("running");
    setDone(0);
    setFailed(0);
    setSkipped(0);

    // Every await here can reject (network, expired session): without the
    // try/finally the button stayed on "Corriendo…", disabled, forever.
    let finished = false;
    try {
      const listed = await attempt(() => getPaletteBackfillTargetsAction());
      if (!listed.ok) {
        finished = true;
        setStatus(listed.error === ATTEMPT_UNREACHED ? "interrupted" : "forbidden");
        return;
      }
      const targets = listed.value;

    setTotal(targets.length);
    let failCount = 0;
    let skipCount = 0;

    for (const target of targets) {
      const hexes = await extractPalette(target.posterUrl).catch(() => [] as string[]);
      // A CORS/decode failure returns [] — skip it. updateItemPaletteAction
      // writes null for an empty array, so calling it here would WIPE an
      // already-good stored palette on a transient miss (this runs over the
      // shared prod catalog). Skipping leaves the existing value untouched.
      if (hexes.length === 0) {
        skipCount++;
        setSkipped(skipCount);
        setDone((d) => d + 1);
        continue;
      }
      const res = await attempt(() => updateItemPaletteAction(target.catalogItemId, hexes));
      if (!res.ok) {
        failCount++;
        setFailed(failCount);
      }
      setDone((d) => d + 1);
    }

    setFailed(failCount);
    finished = true;
    setStatus("done");
    } finally {
      if (!finished) setStatus("interrupted");
    }
  }

  if (status === "forbidden") {
    return <p className="mt-6 text-sm text-text-2">No autorizado.</p>;
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
          {skipped > 0 && ` · ${skipped} sin color (portada no extrajo)`}
          {status === "done" &&
            (failed > 0 ? ` — ${failed} fallaron` : " — listo ✓")}
          {status === "interrupted" &&
            " — se interrumpió (revisa tu conexión y vuelve a iniciar; lo ya escrito se conserva)"}
        </p>
      )}
    </div>
  );
}
