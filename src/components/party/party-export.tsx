"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  getAppleMusicDeveloperTokenAction,
  getMusicServicesAction,
  getPartyExportAction,
  reportAppleMusicExportAction,
  startPartyExportAction,
  stepTidalExportAction,
} from "@/app/actions/music-export-actions";
import { KIcon } from "@/components/kura/icons";
import type { ToastHost } from "@/components/kura/toast";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { doneLine, SERVICE_FAILED_MESSAGE, serviceLabel, tidalStartPath } from "@/modules/music-export/rules";
import type { ExportState, MusicProvider, MusicServices } from "@/modules/music-export/types";
import { partyPath } from "@/modules/party-collections/rules";
import type { PartyDetail } from "@/modules/party-collections/types";
import { ActionRefused, runAppleMusicExport } from "./apple-music-export";
import { musicKit, type MusicKitInstance } from "./musickit";
import { logged, usePartyFailure } from "./party-errors";
import { creditOf, PartyFan, songsLabel, SongCover } from "./party-parts";

/**
 * "Llévala a otra app" (fiesta-app-v2 · `shExport` + `isExport`), contract
 * `state/export-contract.md`. Host AND guests export (D2), each to their own
 * account (D3).
 *
 *  - `ExportSheet`: the sheet body. Asks `getMusicServicesAction` which
 *    services this deploy offers; `available: false` (or the whole export off,
 *    `MIGRATION_0034_LIVE=false` → `unavailable`) = the row says
 *    "Próximamente" and only answers with a toast.
 *  - `ExportScreen`: the full-screen flow, PORTALED to <body> (AGENTS.md),
 *    with the design's four steps: connect · progress · done · failed.
 *      TIDAL (§5): the SERVER works in steps; this loops `step` painting
 *      `processed/total`, waits on `busy` (~1 s) and on `retryAfterSeconds`,
 *      goes back to "conecta tidal." on `not_connected`. Connecting is a plain
 *      navigation to `/api/music/tidal/start?return=/c/{id}`; the callback
 *      lands on `/c/{id}?music=tidal&connected=…` and the room reopens this
 *      screen (party-room.tsx).
 *      Apple Music (§6): MusicKit JS on demand (musickit.ts), `authorize()`
 *      from the "Conectar Apple Music" tap (a popup needs the gesture), then
 *      apple-music-export.ts does the §6.1 steps and reports each batch.
 *    Reintentar never duplicates (server items + reading the playlist first).
 */

type Step =
  | { k: "connect"; ready: boolean }
  | { k: "progress"; processed: number; total: number; current: string | null }
  | { k: "done"; state: ExportState }
  | { k: "failed"; message: string };

type Failure = { error: string; message?: string; retryAfterSeconds?: number; loginPath?: string };

const NETWORK_FAILED =
  "No pudimos hablar con kura. Revisa tu conexión; tu colección sigue intacta y al reintentar no se duplican canciones.";

const HONEY =
  "flex h-14 w-full items-center justify-center rounded-full bg-honey px-5 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press disabled:opacity-60";
const QUIET_52 =
  "flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--glass-bg)] px-5 font-sans text-[15px] font-semibold text-text bl-press";

function stateOf(res: unknown): ExportState | null {
  if (typeof res === "object" && res !== null && "ok" in res && (res as { ok: unknown }).ok === true) {
    return (res as unknown as { state: ExportState }).state;
  }
  return null;
}

function failureOf(res: unknown): Failure | null {
  if (typeof res === "object" && res !== null && "error" in res) return res as Failure;
  return null;
}

const noop = () => () => {};
/** False on the server and during hydration: the screen can open on the
 *  first render (back from TIDAL), and `document.body` only exists here. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- sheet */

export function ExportSheet({
  party,
  toast,
  onPick,
}: {
  party: PartyDetail;
  toast: ToastHost;
  /** `connected`: TIDAL already linked (straight to "pasando la colección."). */
  onPick: (provider: MusicProvider, connected: boolean) => void;
}) {
  const [services, setServices] = useState<MusicServices | null | "off">(null);
  useEffect(() => {
    let live = true;
    void logged("music services", party.id, getMusicServicesAction()).then((res) => {
      if (!live) return;
      if (res && "ok" in res && res.ok) {
        setServices(res.services);
        return;
      }
      const f = failureOf(res);
      if (f && f.error !== "unavailable") console.error("[party] music services refused", { error: f.error });
      setServices("off");
    });
    return () => {
      live = false;
    };
  }, [party.id]);

  const n = party.songs.length;
  const ROW =
    "flex h-[60px] w-full items-center justify-between gap-3 rounded-[18px] bg-[var(--glass-bg)] px-[18px] font-sans text-[16px] font-semibold text-text bl-press aria-disabled:text-text-2";

  const row = (p: MusicProvider) => {
    const s = services && services !== "off" ? services[p] : null;
    const loading = services === null;
    const soon = !loading && (!s || !s.available);
    const connected = p === "tidal" && !!services && services !== "off" && services.tidal.connected;
    const aside = soon ? "Próximamente" : connected ? "Conectado" : null;
    const off = loading || soon || n === 0;
    return (
      <button
        key={p}
        type="button"
        aria-disabled={off || undefined}
        onClick={() => {
          if (loading) return;
          if (soon) {
            toast.show({ message: `Próximamente. ${serviceLabel(p)} todavía no está disponible en kura.` });
            return;
          }
          if (n === 0) {
            toast.show({ message: "La pista está vacía. Pon canciones y luego llévala a otra app." });
            return;
          }
          onPick(p, connected);
        }}
        className={ROW}
      >
        <span className="min-w-0 truncate">Llévala a {serviceLabel(p)}</span>
        <span className="flex flex-none items-center gap-2">
          {aside && (
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-3">{aside}</span>
          )}
          {!soon && (
            <span aria-hidden className="text-text-3">
              <KIcon name="chevron" size={18} />
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      <h2 className="font-brand text-[34px] font-normal leading-[1.02] tracking-[-0.015em] text-text">
        llévala a otra app.
      </h2>
      <p className="mt-2.5 font-sans text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]">
        {n === 0
          ? "La pista está vacía. Cuando haya canciones, creamos una playlist con ellas en tu cuenta."
          : `Creamos una playlist con las ${songsLabel(n)} en tu cuenta. La colección sigue viva en kura.`}
      </p>
      <div className="mt-[18px] flex flex-col gap-2" aria-busy={services === null || undefined}>
        {row("apple_music")}
        {row("tidal")}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- screen */

export function ExportScreen({
  party,
  provider,
  start,
  toast,
  style,
  onClose,
}: {
  party: PartyDetail;
  provider: MusicProvider;
  /** TIDAL: "connect" (no link yet) or "run". Apple Music always prepares MusicKit first. */
  start: "connect" | "run";
  toast: ToastHost;
  /** The room's tinted surface. */
  style?: CSSProperties;
  onClose: () => void;
}) {
  const svc = serviceLabel(provider);
  const fail = usePartyFailure(toast);
  const total0 = party.songs.length;
  const [step, setStep] = useState<Step>(() =>
    provider === "tidal" && start === "run"
      ? { k: "progress", processed: 0, total: total0, current: null }
      : { k: "connect", ready: provider === "tidal" },
  );
  const [mk, setMk] = useState<MusicKitInstance | null>(null);
  const run = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel);

  /** A non-ok action result → the right step (or navigation). */
  const settleFailure = useCallback(
    (res: unknown) => {
      const f = failureOf(res);
      if (!f) {
        setStep({ k: "failed", message: NETWORK_FAILED });
        return;
      }
      switch (f.error) {
        case "signin_required":
        case "not_found":
          fail(res, NETWORK_FAILED);
          return;
        case "not_connected":
          setStep({ k: "connect", ready: true });
          if (f.message) toast.show({ message: f.message });
          return;
        default:
          console.error("[party] export refused", { partyId: party.id, provider, error: f.error });
          setStep({ k: "failed", message: f.message ?? SERVICE_FAILED_MESSAGE(provider) });
      }
    },
    [fail, party.id, provider, toast],
  );

  /** One action, waiting out rate limits; null = handled (or stopped). */
  const call = useCallback(
    async (op: string, fn: () => Promise<unknown>, alive: () => boolean): Promise<ExportState | null> => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const res = await logged(op, party.id, fn());
        if (!alive()) return null;
        const state = stateOf(res);
        if (state) return state;
        const f = failureOf(res);
        if (f && (f.error === "rate_limited" || f.error === "service_rate_limited")) {
          await sleep(Math.max(1, f.retryAfterSeconds ?? 5) * 1000);
          if (!alive()) return null;
          continue;
        }
        settleFailure(res);
        return null;
      }
      setStep({ k: "failed", message: SERVICE_FAILED_MESSAGE(provider) });
      return null;
    },
    [party.id, provider, settleFailure],
  );

  const progressOf = (s: ExportState): Step => ({
    k: "progress",
    processed: s.processed,
    total: s.total,
    current: s.current?.title ?? null,
  });

  const runTidal = useCallback(async () => {
    const id = ++run.current;
    const alive = () => run.current === id;
    let state = await call("start tidal export", () => startPartyExportAction(party.id, "tidal"), alive);
    while (state && state.status !== "done") {
      if (state.busy) {
        await sleep(1000);
        if (!alive()) return;
      } else {
        setStep(progressOf(state));
      }
      state = await call("tidal export step", () => stepTidalExportAction(party.id), alive);
    }
    if (state && alive()) setStep({ k: "done", state });
  }, [call, party.id]);

  const runApple = useCallback(
    async (instance: MusicKitInstance) => {
      const id = ++run.current;
      const alive = () => run.current === id;
      setStep({ k: "progress", processed: 0, total: total0, current: null });
      let state = await call("start apple export", () => startPartyExportAction(party.id, "apple_music"), alive);
      if (!state) return;
      const report = async (input: { playlistId: string; replace?: boolean; added: string[]; missing: string[] }) => {
        for (let attempt = 0; attempt < 10; attempt++) {
          const res = await logged("apple export report", party.id, reportAppleMusicExportAction(party.id, input));
          const s = stateOf(res);
          if (s) return s;
          const f = failureOf(res);
          if (f?.error === "rate_limited" && alive()) {
            await sleep(Math.max(1, f.retryAfterSeconds ?? 5) * 1000);
            continue;
          }
          throw new ActionRefused(res);
        }
        throw new ActionRefused(null);
      };
      for (let round = 0; round < 2; round++) {
        try {
          const done = await runAppleMusicExport({
            mk: instance,
            state,
            report,
            alive,
            onProgress: (p) => alive() && setStep({ k: "progress", ...p }),
          });
          if (done && alive()) setStep({ k: "done", state: done });
          return;
        } catch (err) {
          if (!alive()) return;
          if (err instanceof ActionRefused) {
            // Another device registered its playlist first: continue in THAT one.
            if (round === 0 && failureOf(err.result)?.error === "playlist_exists") {
              const fresh = await call(
                "apple export reload",
                () => getPartyExportAction(party.id, "apple_music"),
                alive,
              );
              if (!fresh) return;
              state = fresh;
              continue;
            }
            settleFailure(err.result);
            return;
          }
          console.error("[party] apple music export failed", { partyId: party.id }, err);
          setStep({ k: "failed", message: SERVICE_FAILED_MESSAGE("apple_music") });
          return;
        }
      }
    },
    [call, party.id, settleFailure, total0],
  );

  // Apple Music: load MusicKit + our developer token; authorized already → go.
  const prepareApple = useCallback(async () => {
    const id = ++run.current;
    try {
      const instance = await musicKit(async () => {
        const res = await getAppleMusicDeveloperTokenAction();
        if ("ok" in res && res.ok) return { token: res.token, expiresAt: res.expiresAt };
        throw new ActionRefused(res);
      });
      if (run.current !== id) return;
      setMk(instance);
      if (instance.isAuthorized) void runApple(instance);
      else setStep({ k: "connect", ready: true });
    } catch (err) {
      if (run.current !== id) return;
      if (err instanceof ActionRefused) {
        settleFailure(err.result);
        return;
      }
      console.error("[party] musickit load failed", err);
      setStep({ k: "failed", message: "No pudimos abrir Apple Music en este navegador. Vuelve a intentarlo." });
    }
  }, [runApple, settleFailure]);

  // The first move, on open. Latest callbacks through a ref: the effect must
  // not re-run (and restart the export) when the toast host changes. Its
  // cleanup bumps `run`, so StrictMode's mount → unmount → mount stops the
  // first run and starts one clean one.
  const first = useRef({ prepareApple, runTidal });
  useEffect(() => {
    first.current = { prepareApple, runTidal };
  });
  useEffect(() => {
    const go = first.current;
    if (provider === "apple_music") void go.prepareApple();
    else if (start === "run") void go.runTidal();
    return () => void (run.current += 1);
  }, [provider, start]);

  const connect = () => {
    if (provider === "tidal") {
      window.location.assign(tidalStartPath(partyPath(party.id)));
      return;
    }
    if (!mk) return;
    // Straight from the tap: MusicKit's sign-in is a popup.
    mk.authorize().then(
      () => void runApple(mk),
      (err: unknown) => {
        console.warn("[party] apple music authorize refused", err);
        toast.show({ message: "No diste permiso en Apple Music." });
      },
    );
  };

  const retry = () => {
    if (provider === "tidal") {
      setStep({ k: "progress", processed: 0, total: total0, current: null });
      void runTidal();
    } else if (mk?.isAuthorized) {
      void runApple(mk);
    } else {
      setStep({ k: "connect", ready: false });
      void prepareApple();
    }
  };

  // "No cierres esta pestaña": the browser's own leave prompt while it runs.
  const running = step.k === "progress";
  useEffect(() => {
    if (!running) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    step.k === "connect"
      ? `conecta ${svc.toLowerCase()}.`
      : step.k === "progress"
        ? "pasando la colección."
        : step.k === "done"
          ? "lista."
          : "no se pudo exportar.";

  let body: string;
  if (step.k === "connect") {
    body = `kura solo crea la playlist «${party.name}» en tu cuenta. No lee ni cambia tu biblioteca.`;
  } else if (step.k === "progress") {
    body = step.current ? `Buscando ${step.current} en ${svc}…` : "Preparando la playlist…";
  } else if (step.k === "done") {
    const s = step.state;
    body =
      s.exported === 0 && !s.playlist
        ? `Ninguna de las ${songsLabel(s.total)} está en ${svc}, así que no creamos la playlist.`
        : doneLine(provider, s.exported, s.total);
  } else {
    body = step.message;
  }

  const hydrated = useHydrated();
  if (!hydrated) return null;

  const pct = step.k === "progress" && step.total > 0 ? Math.min(100, (step.processed / step.total) * 100) : 0;
  const done = step.k === "done" ? step.state : null;

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Llevar la colección a ${svc}`}
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-bg text-text"
      style={style}
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-[calc(30px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
        <div className="-mx-2 flex h-14 items-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-text transition-colors active:bg-white/[0.06]"
          >
            <KIcon name="close" size={16} />
          </button>
        </div>
        <PartyFan songs={party.songs} empty={party.songs.length === 0} lead={90} className="self-start" />
        <span className="mt-[26px] font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-text-3">
          {party.name} → {svc}
        </span>
        <h1 className="mt-2 font-brand text-[36px] font-normal leading-[1.02] tracking-[-0.015em]">{title}</h1>
        <p className="mt-2.5 font-sans text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]" aria-live="polite">
          {body}
        </p>

        {step.k === "progress" && (
          <>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={step.total}
              aria-valuenow={step.processed}
              aria-label="Canciones pasadas"
              className="mt-7 h-1.5 overflow-hidden rounded-[6px] bg-[var(--glass-bg)]"
            >
              <div
                className="h-full rounded-[6px] bg-text transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2.5 flex justify-between gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-3">
              <span>
                {step.processed} de {step.total}
              </span>
              <span>No cierres esta pestaña</span>
            </div>
          </>
        )}

        {done && done.missing.length > 0 && (
          <section aria-label={`No están en ${svc}`} className="mt-6">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-text-3">
              No están en {svc}
            </h2>
            <ul className="mt-1 flex flex-col">
              {done.missing.map((s) => (
                <li key={s.titleId} className="flex items-center gap-3 py-2.5">
                  <SongCover song={{ artworkUrl: s.artworkUrl, paletteHex: null }} size={48} radius={6} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-brand text-[17px] italic leading-[1.2]">{s.title}</span>
                    <span className="truncate font-sans text-[13px] text-text-2">
                      {[s.artist, creditOf(s, false)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-8">
          {step.k === "connect" && (
            <button type="button" disabled={!step.ready} onClick={connect} className={HONEY}>
              {step.ready ? `Conectar ${svc}` : "Preparando…"}
            </button>
          )}
          {done?.playlist?.url && (
            <a href={done.playlist.url} target="_blank" rel="noopener noreferrer" className={HONEY}>
              Abrir en {svc}
            </a>
          )}
          {step.k === "failed" && (
            <button type="button" onClick={retry} className={HONEY}>
              Reintentar
            </button>
          )}
          {step.k !== "progress" && (
            <button type="button" onClick={onClose} className={QUIET_52}>
              Volver a la colección
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
