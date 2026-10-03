"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PARTY_LANDING } from "@/modules/party/event";
import type { Capa, Estado, LandingScene, MsgMode } from "./landing-scene";
import { fadeAmbience, pauseAmbienceWhenHidden, startDrone } from "./party-drone";
import { setSfxContext, sfx } from "./party-sfx";

/*
 * /party — the 3D landing (Claude Design 383601c9…, "proto/Fase 2c -
 * Intro linterna.html"): the cemetery gate in first person, chained until
 * `PARTY_LANDING.opensISO` ("Muy pronto" + countdown), open after ("Entra si te
 * atreves" + Entrar). Without WebGL, with reduced motion or on a weak device
 * it falls back to the static illustration. Markup, copy and URL switches
 * (`?modo` `?estado` `?abre` `?tipo` `?msg` `?intro` `?oscuro`) are the design's.
 *
 * From the previous landing only the sound effects survive (party-sfx.ts): the
 * chains rattle on the padlock, the gate sounds when it opens and when you
 * walk through it.
 *
 * The design's dev toolbar + HUD only show with `?dev`.
 */

type Modo = "3d" | "fallback";
type Tipo = "goteo" | "lapida" | "gotico";

const CAPAS: [Capa, string][] = [
  ["tex", "Texturas"],
  ["niebla", "Niebla"],
  ["hierba", "Hierba"],
  ["telas", "Telarañas"],
  ["nubes", "Nubes"],
];
const MSGS: [MsgMode, string][] = [
  ["objeto", "Msg: junto a la reja"],
  ["contador", "En el titular"],
  ["subtitulo", "Subtítulo"],
];
const TIPOS: [Tipo, string][] = [
  ["goteo", "Goteo"],
  ["lapida", "Lápida"],
  ["gotico", "Gótico"],
];
const ALL_ON: Record<Capa, boolean> = { tex: true, niebla: true, hierba: true, telas: true, nubes: true };

function boot() {
  const q = new URLSearchParams(location.search);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let gl = false;
  try {
    const c = document.createElement("canvas");
    gl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {}
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (!!nav.deviceMemory && nav.deviceMemory <= 2) || (!!nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
  const reason = !gl ? "sin WebGL" : reduce ? "prefers-reduced-motion" : weak ? "dispositivo débil" : "";
  const modo = (q.get("modo") as Modo | null) || (reason ? "fallback" : "3d");
  const abre = new Date(q.get("abre") || PARTY_LANDING.opensISO);
  const estado = (q.get("estado") as Estado | null) || (Date.now() >= abre.getTime() ? "revelado" : "teaser");
  return {
    modo,
    estado,
    abre,
    tipo: (q.get("tipo") as Tipo | null) || "goteo",
    msg: (q.get("msg") as MsgMode | null) || "contador",
    forced: !!q.get("estado"),
    reason: q.get("modo") ? "forzado por URL" : reason,
    dark: q.get("oscuro") !== "0",
    skipIntro: q.get("intro") === "0",
    dev: q.has("dev"),
  };
}

/**
 * Where the open gate leads. The labyrinth sends anyone who arrives before the real opening back to the
 * gate, so a gate opened early for testing (`?estado=revelado`, `?abre=…`, "Simular apertura") carries
 * the same switch along.
 */
const gamesHref = () =>
  PARTY_LANDING.gamesUrl + (Date.now() < new Date(PARTY_LANDING.opensISO).getTime() ? "?estado=revelado" : "");

let labyrinthWarm = false;
function preloadLabyrinth() {
  if (labyrinthWarm) return;
  labyrinthWarm = true;
  const add = (rel: string, href: string) => {
    const l = document.createElement("link");
    l.rel = rel;
    l.href = href;
    document.head.appendChild(l);
  };
  ["app", "motor", "api", "sfx", "juegos/registro", "texturas", "deco", "cementerio", "velas", "pistas"].forEach((m) =>
    add("modulepreload", `/party/laberinto/${m}.js`),
  );
  ["three.module.min", "three.core.min"].forEach((m) => add("modulepreload", `/party/vendor/${m}.js`));
  ["/party/laberinto/mapa.json", "/party/laberinto/app.css", "/party/laberinto/foto.jpg"].forEach((u) => add("prefetch", u));
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function PartyLanding() {
  const [b] = useState(boot);
  const [modo, setModo] = useState<Modo>(b.modo);
  const [estado, setEstado] = useState<Estado>(b.estado);
  const [tipo, setTipo] = useState<Tipo>(b.tipo);
  const [fbNote, setFbNote] = useState(b.modo === "fallback" ? `Fallback activo (${b.reason || "—"}). Forzar 3D: ?modo=3d` : "");
  // Dev toolbar state (the design's defaults).
  const [zonas, setZonas] = useState(false);
  const [hudOn, setHudOn] = useState(true);
  const [linterna, setLinterna] = useState(true);
  const [tam, setTam] = useState(10);
  const [int, setInt] = useState(30);
  const [dark, setDark] = useState(b.dark);
  const [capas, setCapas] = useState(ALL_ON);
  const [msgMode, setMsgMode] = useState<MsgMode>(b.msg);
  /** A gate message standing in for the headline (2.8 s), or null. */
  const [flash, setFlash] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLElement>(null);
  const hero = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const msg = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLDivElement>(null);
  const introItem = useRef<HTMLDivElement>(null);
  const liveP = useRef<HTMLParagraphElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);
  const msgModeRef = useRef(msgMode);
  const count = useRef<(HTMLElement | null)[]>([]);
  const scene = useRef<LandingScene | null>(null);
  const clock = useRef({ abre: b.abre, forced: b.forced });
  const audio = useRef<AudioContext | null>(null);
  const estadoRef = useRef(estado);

  /** Effects ride one AudioContext, created suspended so the samples decode before the first tap. */
  const play = (fx: () => void) => {
    const ctx = audio.current;
    if (!ctx || ctx.state === "closed") return;
    ctx.resume().then(fx).catch(() => {});
  };

  useEffect(() => {
    const C = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    audio.current = ctx;
    setSfxContext(ctx);
    // The previous landing's ambient drone. Wired while the context is still
    // suspended; the first tap anywhere lets it sound.
    startDrone(ctx);
    const unlock = () => {
      if (ctx.state !== "closed") ctx.resume().catch(() => {});
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("touchend", unlock, true);
    };
    window.addEventListener("click", unlock, true);
    window.addEventListener("touchend", unlock, true);
    const stopPausing = pauseAmbienceWhenHidden(() => ctx);
    return () => {
      stopPausing();
      window.removeEventListener("click", unlock, true);
      window.removeEventListener("touchend", unlock, true);
      setSfxContext(null);
      ctx.close().catch(() => {});
      audio.current = null; // see learnings/2026-09-29-audiocontext-cerrado-tras-remontar
    };
  }, []);

  // Countdown: one interval writing the four cells; at zero the gate opens (unless the state was forced).
  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, clock.current.abre.getTime() - Date.now());
      const s = Math.floor(ms / 1000);
      const cells = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
      cells.forEach((n, i) => {
        const el = count.current[i];
        if (el) el.textContent = pad(n);
      });
      if (ms === 0 && !clock.current.forced) setEstado("revelado");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = estado === "teaser" ? "Muy pronto" : "Entra si te atreves";
    // The gate is open: warm the labyrinth (its modules, three.js, map, styles) so walking in doesn't wait on the network.
    if (estado === "revelado") preloadLabyrinth();
    scene.current?.setEstado(estado);
    // The gate swinging open live (not on first paint) sounds like it.
    if (estadoRef.current === "teaser" && estado === "revelado") sfx.gateOpen();
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    if (modo !== "3d") return;
    let live = true;
    let handle: LandingScene | null = null;
    const toFallback = (reason: string) => {
      if (!live) return;
      setModo("fallback");
      setFbNote(`Fallback activo (${reason}).`);
    };
    import("./landing-scene")
      .then(({ initLandingScene }) => {
        if (!live || !stage.current || !tag.current || !veil.current || !top.current || !hero.current || !hud.current || !msg.current || !liveP.current || !intro.current || !introItem.current) return;
        handle = initLandingScene({
          stage: stage.current,
          tag: tag.current,
          veil: veil.current,
          top: top.current,
          hero: hero.current,
          hud: hud.current,
          msg: msg.current,
          intro: intro.current,
          introItem: introItem.current,
          skipIntro: b.skipIntro,
          audio: () => audio.current,
          live: liveP.current,
          msgMode: () => msgModeRef.current,
          abre: () => clock.current.abre,
          flash: (t) => {
            // Altura fija: el hero no cambia y la cámara no se reencuadra.
            if (t !== null && h1.current) h1.current.style.height = h1.current.offsetHeight + "px";
            setFlash(t);
          },
          estado: estadoRef.current,
          dark: b.dark,
          href: gamesHref,
          onFallback: toFallback,
          onRattle: () => play(sfx.rattle),
          click: (delay) => sfx.click(delay),
          onFx: (fx) => play(sfx[fx]),
          onEnter: () => {
            play(sfx.gateOpen);
            // The walk ends in a page change: fade the drone under the veil so it doesn't pop when the page goes.
            setTimeout(() => audio.current && fadeAmbience(audio.current, false), 2300);
          },
        });
        scene.current = handle;
      })
      .catch((e) => {
        console.warn("3D falló, usando fallback", e);
        toFallback("error al iniciar 3D");
      });
    return () => {
      live = false;
      handle?.dispose();
      scene.current = null;
    };
  }, [modo, b.dark, b.skipIntro]);

  // The message must fit on one line: shrink it if it doesn't; the base headline gets its own size back.
  useLayoutEffect(() => {
    const h = h1.current;
    if (!h || !hero.current) return;
    h.style.fontSize = "";
    if (flash === null) {
      h.style.height = "";
      return;
    }
    const k = hero.current.clientWidth / h.scrollWidth;
    if (k < 1) h.style.fontSize = parseFloat(getComputedStyle(h).fontSize) * k * 0.95 + "px";
  }, [flash]);

  const pickMsg = (m: MsgMode) => {
    scene.current?.hush();
    msgModeRef.current = m;
    setMsgMode(m);
  };
  const forceEstado = (e: Estado) => {
    clock.current.forced = true;
    setEstado(e);
  };
  const simular = () => {
    clock.current = { abre: new Date(Date.now() + 5000), forced: false };
    setEstado("teaser");
  };
  const onCta = (e: React.MouseEvent) => {
    if (estado !== "revelado" || !scene.current) return;
    e.preventDefault();
    scene.current.walkIn();
  };
  const toggleCapa = (c: Capa) => {
    const on = !capas[c];
    setCapas({ ...capas, [c]: on });
    scene.current?.setCapa(c, on);
  };

  const teaser = estado === "teaser";

  return (
    <div className="pl" data-modo={modo} data-estado={estado} data-tipo={tipo} data-msg={msgMode}>
      <div className="pl-stage" ref={stage} aria-hidden="true" />
      <div className="tag" ref={tag} aria-hidden="true" />
      <div className="pl-veil" ref={veil} aria-hidden="true" />
      <div className="pl-msg" ref={msg} aria-hidden="true" />

      <div className="pl-intro" ref={intro} role="button" tabIndex={0} aria-label="¡Es peligroso ir solo! Toma esto. Toca para tomar la linterna.">
        <div className="box">
          <h2>¡Es peligroso ir solo!</h2>
          <p>Toma esto</p>
          <div className="pl-intro-item" ref={introItem} aria-hidden="true" />
        </div>
      </div>

      <header className="top" ref={top}>
        {b.dev && (
          <div className="devbar" role="toolbar" aria-label="Controles de desarrollo">
            <span className="badge mono">FASE 2C · INTRO</span>
            <div className="seg">
              <button aria-pressed={teaser} onClick={() => forceEstado("teaser")}>Teaser</button>
              <button aria-pressed={!teaser} onClick={() => forceEstado("revelado")}>Revelado</button>
            </div>
            <button onClick={simular}>Simular apertura (5 s)</button>
            <button aria-pressed={zonas} onClick={() => { setZonas(!zonas); scene.current?.setZonas(!zonas); }}>Ver zonas</button>
            <button onClick={() => scene.current?.resetView()}>Reiniciar vista</button>
            <button onClick={() => scene.current?.showIntro()}>Ver intro</button>
            <button aria-pressed={hudOn} onClick={() => setHudOn(!hudOn)}>HUD</button>
            <div className="seg" aria-label="Mensaje">
              {MSGS.map(([m, label]) => (
                <button key={m} aria-pressed={msgMode === m} onClick={() => pickMsg(m)}>{label}</button>
              ))}
            </div>
            <div className="seg" aria-label="Tipografía">
              {TIPOS.map(([t, label]) => (
                <button key={t} aria-pressed={tipo === t} onClick={() => setTipo(t)}>{label}</button>
              ))}
            </div>
            <button aria-pressed={linterna} onClick={() => { setLinterna(!linterna); scene.current?.setLinterna(!linterna); }}>Linterna</button>
            <label className="rng">
              Tamaño{" "}
              <input type="range" min={5} max={40} step={1} value={tam} onChange={(e) => { const v = +e.target.value; setTam(v); scene.current?.setLinternaTam(v); }} />
              <output className="mono">{tam}°</output>
            </label>
            <label className="rng">
              Intensidad{" "}
              <input type="range" min={0} max={250} step={5} value={int} onChange={(e) => { const v = +e.target.value; setInt(v); scene.current?.setLinternaInt(v); }} />
              <output className="mono">{int}%</output>
            </label>
            <button aria-pressed={dark} onClick={() => { setDark(!dark); scene.current?.setDark(!dark); }}>Oscuridad</button>
            <div className="seg" aria-label="Capas">
              {CAPAS.map(([c, label]) => (
                <button key={c} aria-pressed={capas[c]} onClick={() => toggleCapa(c)}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      <picture className="pl-fallback">
        <img
          src={teaser ? "/party/og-teaser.jpg" : "/party/og.jpg"}
          width={1200}
          height={630}
          alt="Ilustración: la reja de un cementerio de noche, cerrada con cadenas y un candado, con mausoleos, un árbol seco, un farol encendido y ojos que brillan entre las rejas."
        />
      </picture>
      {b.dev && <p className="fb-note mono">{fbNote}</p>}

      <main>
        <section className={flash === null ? "hero" : "hero flash"} ref={hero} aria-labelledby="pl-headline">
          <h1 id="pl-headline" ref={h1}>{flash ?? (teaser ? "Muy pronto" : "Entra si te atreves")}</h1>
          <ol className="count" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <Cell key={i} sep={i > 0}>
                <b ref={(el) => { count.current[i] = el; }}>00</b>
              </Cell>
            ))}
          </ol>
          <p className="sr">
            Abre el{" "}
            <time dateTime={b.abre.toISOString()}>
              {new Intl.DateTimeFormat("es", { dateStyle: "full", timeStyle: "short" }).format(b.abre)}
            </time>
            .
          </p>
          <p className="sr" ref={liveP} aria-live="polite" />
          <a className="cta" href={gamesHref()} onClick={onCta}>Entrar</a>
        </section>
      </main>

      <div className={`pl-hud mono${b.dev && hudOn ? "" : " off"}`} ref={hud} aria-hidden="true" />
    </div>
  );
}

function Cell({ sep, children }: { sep: boolean; children: React.ReactNode }) {
  return (
    <>
      {sep && <li className="sep">:</li>}
      <li>{children}</li>
    </>
  );
}
