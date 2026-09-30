"use client";

import { useEffect, useState } from "react";
import { disconnectTidalAction, getMusicServicesAction } from "@/app/actions/music-export-actions";
import { tidalConnectFailed, type TidalReturn } from "@/components/party/export-copy";
import { tidalStartPath } from "@/modules/music-export/rules";

/**
 * Ajustes › música: the TIDAL link that "Llévala a otra app" uses (export
 * contract §4.1.5). Draws NOTHING while the export is off
 * (`MIGRATION_0034_LIVE=false` → `unavailable`) or TIDAL isn't configured on
 * this deploy — no "Próximamente" row in settings. Connecting is a plain
 * navigation to `/api/music/tidal/start?return=/settings/musica`; the
 * callback lands back here with `?music=tidal&connected=…` (`landing`).
 */
export function TidalLink({ landing }: { landing: TidalReturn | null }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(
    landing ? (landing.ok ? "TIDAL quedó conectado." : tidalConnectFailed(landing.reason)) : null,
  );

  useEffect(() => {
    if (landing) {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      } catch {
        // the query stays; harmless
      }
    }
    let live = true;
    getMusicServicesAction()
      .then((res) => {
        if (!live) return;
        if ("ok" in res && res.ok && res.services.tidal.available) setConnected(res.services.tidal.connected);
      })
      .catch((err: unknown) => console.error("[settings] music services failed", err));
    return () => {
      live = false;
    };
  }, [landing]);

  if (connected === null) return null;

  async function disconnect() {
    setBusy(true);
    try {
      const res = await disconnectTidalAction();
      if (!("ok" in res && res.ok)) throw new Error("error" in res ? res.error : "refused");
      setConnected(false);
      setNote("Desconectaste TIDAL. Tus playlists siguen en tu cuenta.");
    } catch (err) {
      console.error("[settings] disconnect tidal failed", err);
      setNote("No pudimos desconectar TIDAL. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="mx-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">Llevar colecciones</span>
      <div className="flex min-h-[52px] items-center gap-3 rounded-[var(--r-surface)] bg-surface-1 pl-4 pr-2">
        <span className="flex-1 text-[16px] text-text">TIDAL</span>
        {connected ? (
          <>
            <span className="text-[15px] text-text-3">Conectado</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="h-11 rounded-full px-3 text-[15px] font-medium text-text transition-colors active:bg-white/[0.06] disabled:opacity-60"
            >
              {busy ? "Desconectando…" : "Desconectar"}
            </button>
          </>
        ) : (
          <a
            href={tidalStartPath("/settings/musica")}
            className="flex h-11 items-center rounded-full px-3 text-[15px] font-medium text-text transition-colors active:bg-white/[0.06]"
          >
            Conectar
          </a>
        )}
      </div>
      <p className="px-2 text-[13px] leading-[1.5] text-pretty text-text-2">
        {note ?? "Con TIDAL conectado, kura solo crea las playlists de las fiestas que llevas. No lee ni cambia tu biblioteca."}
      </p>
    </div>
  );
}
