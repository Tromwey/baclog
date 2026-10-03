"use client";

import { useEffect, useRef, useState } from "react";
import { PARTY_LANDING } from "@/modules/party/event";
import { pauseAmbienceWhenHidden, startDrone, startOrgan, swellAmbience } from "../party-drone";

/*
 * Mounts the labyrinth. The labyrinth is NOT bundled: it is the design's own
 * vanilla ES modules (app.js, motor.js, cementerio.js, the minigames…) copied
 * verbatim into public/party/laberinto — only their `from 'three'` points at
 * public/party/vendor instead of an import map — and loaded by the browser at
 * runtime. To update it, re-copy the files from the design project; don't
 * port them. This file is the design page's inline <script>, nothing more.
 *
 * Not in production: the design's "Tweaks" panel (React UMD + Babel from a
 * CDN). Its saved values are applied as-is below. The dev bar shows with
 * `?dev=1` (`?dev=abierta` opens it), not by default.
 */

const APP_URL = "/party/laberinto/app.js";

/** Did the visitor walk here from another page of /party (the gate, the Mausoleum)? */
function cameFromParty(): boolean {
  try {
    const r = new URL(document.referrer);
    return r.origin === location.origin && r.pathname.startsWith("/party") && r.pathname !== location.pathname;
  } catch {
    return false;
  }
}

function preload(urls: string[]) {
  urls.forEach((href) => {
    const l = document.createElement("link");
    l.rel = "prefetch";
    l.href = href;
    document.head.appendChild(l);
  });
}

/** The design's TWEAK_DEFAULTS (how the cats' objects are found and delivered). */
const TWEAKS = { aros: true, destello: true, alcance: 8, hallazgo: "pantalla", vienen: "json", miau: 30, inventario: true, minimapa: true };

type Linterna = { grados?: number; pct?: number; alcance?: number; borde?: number };
type LabApp = {
  lab: { ajustarLinterna(l: Linterna): void };
  tweaks(t: typeof TWEAKS): void;
  desmontar(): void;
};
type LabModule = {
  montarLaberinto(o: { host: HTMLElement; entrada: boolean; dev: boolean; tema: string; mausoleoUrl: string | null; apiBase: string | null }): Promise<LabApp>;
};

export function LaberintoClient() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // Behind the gate: before it opens there is nothing here (`?estado=revelado` for testing, as on the gate).
    const abre = new Date(q.get("abre") || PARTY_LANDING.opensISO).getTime();
    if (Date.now() < abre && q.get("estado") !== "revelado") {
      location.replace("/party");
      return;
    }
    let live = true;
    let app: LabApp | null = null;
    const fromParty = cameFromParty();
    // A cross-page fade the browser skips (hidden tab, reduced motion) rejects a promise nobody holds: keep the console clean.
    const onReveal = (e: Event) => (e as Event & { viewTransition?: { finished: Promise<void> } }).viewTransition?.finished.catch(() => {});
    window.addEventListener("pagereveal", onReveal);
    // The Mausoleum is next: have its page and data in the cache before the door opens.
    preload(["/party/mausoleo", "/party/mausoleo/nichos.json"]);

    // The gate's ambient drone keeps sounding in here (founder, 2026-10-02; not in the design). It rides the
    // labyrinth's own AudioContext — `window.__audio.ctx`, the one its sfx.js creates or reuses — and starts
    // with the first tap or key, which is also what lets the browser play anything.
    const w = window as Window & { __audio?: { ctx: AudioContext | null }; webkitAudioContext?: typeof AudioContext };
    let stopDrone: (() => void) | null = null;
    const unlock = () => {
      const C = window.AudioContext || w.webkitAudioContext;
      if (!C) return;
      const au = (w.__audio = w.__audio || { ctx: null });
      const ctx = (au.ctx = au.ctx || new C());
      if (!stopDrone) {
        const drone = startDrone(ctx);
        // The organ is the labyrinth's alone: the gate only has the drone.
        const organ = startOrgan(ctx);
        swellAmbience(ctx);
        stopDrone = () => {
          drone();
          organ();
        };
      }
      ctx.resume().catch(() => {});
      ["click", "touchend", "keydown"].forEach((t) => window.removeEventListener(t, unlock, true));
    };
    ["click", "touchend", "keydown"].forEach((t) => window.addEventListener(t, unlock, true));
    const stopPausing = pauseAmbienceWhenHidden(() => w.__audio?.ctx);
    (async () => {
      try {
        const mod: LabModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ APP_URL);
        if (!live || !host.current) return;
        const mounted = await mod.montarLaberinto({
          host: host.current,
          // Arriving from the gate or the Mausoleum there is no "click to enter" stop: the walk continues.
          entrada: q.get("entrada") !== "0" && !fromParty,
          dev: false,
          tema: "cementerio",
          // A visit opened early for testing carries its switch on to the Mausoleum (which has the same gate).
          mausoleoUrl: PARTY_LANDING.mausoleoUrl && PARTY_LANDING.mausoleoUrl + (q.get("estado") === "revelado" ? "?estado=revelado" : ""),
          // The real seal server (src/modules/party/lab.ts) once migration 0038 is live; until then, the
          // design's localStorage mock (null).
          apiBase: PARTY_LANDING.labServerLive ? "/api/party/lab" : null,
        });
        if (!live) {
          mounted.desmontar();
          return;
        }
        app = mounted;
        app.tweaks(TWEAKS);
        // ?haz=18&int=45&alcance=26&borde=55 fija la linterna desde la URL
        const lin: Linterna = {};
        (
          [
            ["haz", "grados"],
            ["int", "pct"],
            ["alcance", "alcance"],
            ["borde", "borde"],
          ] as const
        ).forEach(([k, p]) => {
          if (q.get(k)) lin[p] = +q.get(k)!;
        });
        if (Object.keys(lin).length) app.lab.ajustarLinterna(lin);
      } catch (e) {
        console.error(e);
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      ["click", "touchend", "keydown"].forEach((t) => window.removeEventListener(t, unlock, true));
      stopPausing();
      window.removeEventListener("pagereveal", onReveal);
      stopDrone?.();
      app?.desmontar();
    };
  }, []);

  return (
    <div className="lab-host" ref={host}>
      {failed && <p className="lab-err">No se pudo iniciar el laberinto en 3D. La vista 2D llega en la fase 5.</p>}
    </div>
  );
}
