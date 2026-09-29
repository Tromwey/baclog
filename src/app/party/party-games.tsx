"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PARTY_EVENT } from "@/modules/party/event";
import { sfx } from "./party-sfx";

/*
 * The /party minigames (not in the design — founder, 2026-09-28): each
 * secret tombstone is SEALED until its game is won; winning lights its candle
 * and opens the info sheet. Every game fits one thumb and ~30 s, and nobody
 * gets stuck: after a few misses (or a while) "Pedir ayuda al más allá"
 * solves it. Visual language = the invitation's (./party-scene.tsx).
 */

export type GameKey = "host" | "date" | "place" | "bring" | "theme";

type GameProps = { onWin: () => void; onFail: () => void };

const ACCENT = "#e8785d";
const INK = "#ece6dc";
const INK_2 = "#bdb3a8";
const INK_3 = "#a79d92";
const eyebrow: CSSProperties = { fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: ACCENT };
const title: CSSProperties = { fontFamily: "var(--pt-serif)", fontSize: "32px", lineHeight: 1.05, color: INK };
const ghostBtn: CSSProperties = { height: "52px", borderRadius: "999px", border: "1px solid rgba(236,230,220,.25)", background: "transparent", color: INK, fontWeight: 600, fontSize: "15px", cursor: "pointer" };
const primaryBtn: CSSProperties = { height: "56px", borderRadius: "999px", border: "none", background: "#d9573b", color: "#140e0c", fontWeight: 700, fontSize: "15px", letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" };

const GAMES: Record<GameKey, { label: string; prompt: string; failsForHelp: number; Game: (p: GameProps) => ReactNode }> = {
  host: { label: "Lápida sellada", prompt: "¿Cuándo nació quien aquí yace?", failsForHelp: 3, Game: LockGame },
  date: { label: "El reloj del camposanto", prompt: "Detén la manecilla en la medianoche. Tres veces seguidas.", failsForHelp: 3, Game: ClockGame },
  place: { label: "Un mapa hecho pedazos", prompt: "Gira cada pedazo hasta que el camino lleve a la X.", failsForHelp: 99, Game: MapGame },
  bring: { label: "El caldero burbujea", prompt: "Repite la receta del brebaje.", failsForHelp: 3, Game: BrewGame },
  theme: { label: "Detrás de la máscara", prompt: "Encuentra las parejas.", failsForHelp: 6, Game: MaskGame },
};

/** Seconds before help shows up even without misses (the map has no "miss"). */
const HELP_AFTER_S = 30;

export function GameSheet({ game, onWin, onClose }: { game: GameKey; onWin: () => void; onClose: () => void }) {
  const { label, prompt, failsForHelp, Game } = GAMES[game];
  const [fails, setFails] = useState(0);
  const [late, setLate] = useState(false);
  const [won, setWon] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLate(true), HELP_AFTER_S * 1000);
    return () => clearTimeout(t);
  }, []);

  const win = () => {
    if (won) return;
    setWon(true);
    sfx.unseal();
    setTimeout(onWin, 900);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(0,0,0,.45)" }} />
      <div
        role="dialog"
        aria-label={label}
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, maxWidth: "440px", margin: "0 auto", zIndex: 60, maxHeight: "90dvh", overflowY: "auto", background: "#15120f", borderTop: "1px solid rgba(236,230,220,.12)", borderRadius: "24px 24px 0 0", padding: "12px 24px calc(28px + env(safe-area-inset-bottom))", animation: "pt-sheetUp .35s cubic-bezier(.2,.8,.2,1) both", display: "flex", flexDirection: "column", gap: "18px" }}
      >
        <div style={{ alignSelf: "center", width: "40px", height: "4px", borderRadius: "2px", background: "rgba(236,230,220,.2)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={eyebrow}>{label}</div>
          <div style={title}>{won ? "La vela se enciende." : prompt}</div>
        </div>
        <div style={{ position: "relative", opacity: won ? 0.35 : 1, pointerEvents: won ? "none" : "auto", transition: "opacity .4s" }}>
          <Game
            onWin={win}
            onFail={() => {
              sfx.thud();
              setFails((n) => n + 1);
            }}
          />
        </div>
        {!won && (fails >= failsForHelp || late) ? (
          <button type="button" onClick={win} style={{ ...ghostBtn, borderColor: "rgba(232,120,93,.5)", color: ACCENT }}>
            Pedir ayuda al más allá
          </button>
        ) : null}
        {!won ? (
          <button type="button" onClick={onClose} style={ghostBtn}>
            Volver al cementerio
          </button>
        ) : null}
      </div>
    </>
  );
}

function Feedback({ text, tone }: { text: string; tone: "bad" | "ok" | "info" }) {
  return (
    <div aria-live="polite" style={{ minHeight: "22px", textAlign: "center", fontFamily: "var(--pt-serif)", fontStyle: "italic", fontSize: "18px", color: tone === "bad" ? ACCENT : tone === "ok" ? "#ffcf8a" : INK_2 }}>
      {text}
    </div>
  );
}

// ---------- host: the birthday lock ----------

const HOST_BIRTH = { d: 20, m: 11, y: 1994 };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const GLYPHS = "▒░▓#%&@$¿?§¤";

/**
 * The host's name as a corrupted epitaph (like the death date on the host's
 * sheet): only a few letters are legible at any moment — never all — and
 * which ones keeps shifting, so guests can piece together whose grave it is.
 */
function GlitchName({ name }: { name: string }) {
  const chars = [...name];
  const letters = chars.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
  const maxClear = Math.max(1, Math.floor(letters.length * 0.4));
  const scramble = () => {
    const clear = new Set([...letters].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * maxClear)));
    return chars.map((c, i) => (!c.trim() || clear.has(i) ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]));
  };
  const [shown, setShown] = useState<string[]>(scramble);
  useEffect(() => {
    const t = setInterval(() => setShown(scramble()), 420);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- name is constant per mount
  }, []);
  return (
    <div aria-label="Nombre ilegible" style={{ fontFamily: "var(--pt-serif)", fontSize: "34px", lineHeight: 1.1, color: INK, animation: "pt-deathGlitch 3.5s steps(1) infinite", whiteSpace: "nowrap" }}>
      {shown.map((c, i) => (
        <span key={i} style={GLYPHS.includes(c) ? { fontFamily: "var(--pt-mono)", fontSize: "26px", color: "#6a6158" } : undefined}>
          {c}
        </span>
      ))}
    </div>
  );
}

function LockGame({ onWin, onFail }: GameProps) {
  const [d, setD] = useState(1);
  const [m, setM] = useState(1);
  const [y, setY] = useState(1990);
  const [hint, setHint] = useState("");

  const tryIt = () => {
    const off = Math.abs(Date.UTC(y, m - 1, d) - Date.UTC(HOST_BIRTH.y, HOST_BIRTH.m - 1, HOST_BIRTH.d)) / 864e5;
    if (off === 0) return onWin();
    onFail();
    setHint(off > 1500 ? "Helado. Ni cerca." : off > 365 ? "Frío…" : off > 60 ? "Tibio." : off > 7 ? "Caliente." : "¡Quemas!");
  };

  const wheel: CSSProperties = { height: "64px", width: "100%", padding: "0 10px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: INK, fontFamily: "var(--pt-serif)", fontSize: "26px", fontWeight: 600, textAlign: "center", textAlignLast: "center", appearance: "none" };
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "14px 0 6px", borderRadius: "16px", background: "linear-gradient(180deg,#2a2622,#1a1714)" }}>
        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "11px", letterSpacing: ".35em", color: INK_3 }}>AQUÍ YACE</div>
        <GlitchName name={PARTY_EVENT.host} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.4fr", gap: "8px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: INK_3, textAlign: "center" }}>
          Día
          <select value={d} onChange={(e) => setD(+e.target.value)} style={wheel}>
            {range(1, 31).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: INK_3, textAlign: "center" }}>
          Mes
          <select value={m} onChange={(e) => setM(+e.target.value)} style={wheel}>
            {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: INK_3, textAlign: "center" }}>
          Año
          <select value={y} onChange={(e) => setY(+e.target.value)} style={wheel}>
            {range(1975, 2008).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <Feedback text={hint} tone="bad" />
      <button type="button" onClick={tryIt} style={primaryBtn}>
        Girar la llave
      </button>
    </div>
  );
}

// ---------- date: stop the clock at midnight ----------

const CLOCK_PERIODS = [2600, 1900, 1400]; // ms per turn, faster each hit
const CLOCK_TOLERANCE = 16; // degrees either side of 12

function ClockGame({ onWin, onFail }: GameProps) {
  const [hits, setHits] = useState(0);
  const [msg, setMsg] = useState<{ t: string; tone: "bad" | "ok" | "info" }>({ t: "Toca cuando pase por las 12.", tone: "info" });
  const handRef = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const paused = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused.current) {
        angle.current = (angle.current + (360 * dt) / CLOCK_PERIODS[Math.min(hits, 2)]) % 360;
        handRef.current?.setAttribute("transform", `rotate(${angle.current} 100 100)`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hits]);

  const stop = () => {
    if (paused.current) return;
    const a = angle.current;
    const off = Math.min(a, 360 - a);
    paused.current = true;
    if (off <= CLOCK_TOLERANCE) {
      const n = hits + 1;
      if (n === 3) sfx.toll();
      else sfx.bell();
      setMsg({ t: n === 3 ? "Medianoche." : "¡Dong!", tone: "ok" });
      setTimeout(() => {
        paused.current = false;
        angle.current = 180;
        setHits(n);
        if (n === 3) onWin();
      }, 650);
    } else {
      // Three IN A ROW: a miss resets the count (and the speed).
      onFail();
      setMsg({ t: `${a < 180 ? "Tarde" : "Muy pronto"}. ${hits ? "Vuelves a empezar." : "Otra vez."}`, tone: "bad" });
      setTimeout(() => {
        paused.current = false;
        angle.current = 180;
        setHits(0);
      }, 650);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <button type="button" onClick={stop} aria-label="Detener el reloj" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}>
        <svg width="220" height="220" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="92" fill="#1d1a17" stroke="#4a433c" strokeWidth="4" />
          <path d={`M100 100 L${100 + 92 * Math.sin((-CLOCK_TOLERANCE * Math.PI) / 180)} ${100 - 92 * Math.cos((CLOCK_TOLERANCE * Math.PI) / 180)} A92 92 0 0 1 ${100 + 92 * Math.sin((CLOCK_TOLERANCE * Math.PI) / 180)} ${100 - 92 * Math.cos((CLOCK_TOLERANCE * Math.PI) / 180)} Z`} fill="rgba(217,87,59,.28)" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="100" y1="14" x2="100" y2={i === 0 ? "34" : "24"} stroke={i === 0 ? ACCENT : "#8a7f73"} strokeWidth={i === 0 ? 4 : 2} transform={`rotate(${i * 30} 100 100)`} />
          ))}
          <text x="100" y="54" textAnchor="middle" fontFamily="var(--pt-serif)" fontSize="22" fill="#d2c7ba">XII</text>
          <g ref={handRef}>
            <line x1="100" y1="112" x2="100" y2="26" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="100" r="7" fill={ACCENT} />
        </svg>
      </button>
      <div style={{ display: "flex", gap: "8px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: i < hits ? "#ffcf8a" : "rgba(236,230,220,.18)", boxShadow: i < hits ? "0 0 8px 2px rgba(255,170,90,.5)" : "none" }} />
        ))}
      </div>
      <Feedback text={msg.t} tone={msg.tone} />
    </div>
  );
}

// ---------- place: the torn map ----------

function MapArt() {
  return (
    <svg width="240" height="240" viewBox="0 0 240 240" style={{ display: "block" }}>
      <rect width="240" height="240" fill="#2c2824" />
      <path d="M0 0H240V240H0Z" fill="url(#pt-parch)" />
      <defs>
        <radialGradient id="pt-parch" cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#3a332c" />
          <stop offset="1" stopColor="#1f1b17" />
        </radialGradient>
      </defs>
      {[[40, 60], [150, 40], [70, 170], [185, 150], [120, 110]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y + 18}V${y + 6}a8 8 0 0 1 16 0V${y + 18}Z`} fill="#6a6158" />
      ))}
      <path d="M22 220 C 60 200, 50 150, 100 140 S 150 90, 175 80 S 200 50, 205 38" fill="none" stroke="#b8ad9f" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
      <path d="M196 26 L216 46 M216 26 L196 46" stroke="#d9573b" strokeWidth="5" strokeLinecap="round" />
      <circle cx="22" cy="220" r="6" fill="#b8ad9f" />
      <text x="30" y="30" fontFamily="var(--pt-serif)" fontSize="15" fill="#8a7f73" letterSpacing="3">N</text>
    </svg>
  );
}

function MapGame({ onWin }: GameProps) {
  // Quarter turns per piece; never start solved.
  const [rot, setRot] = useState(() => [1, 3, 2, 1].map((r) => r + 4));
  const solved = rot.every((r) => r % 4 === 0);
  const done = useRef(false);

  useEffect(() => {
    if (solved && !done.current) {
      done.current = true;
      setTimeout(onWin, 350);
    }
  }, [solved, onWin]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "120px 120px", gap: solved ? "0px" : "6px", transition: "gap .4s" }}>
        {rot.map((r, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Girar pedazo ${i + 1}`}
            onClick={() => {
              if (solved) return;
              sfx.scrape();
              setRot((a) => a.map((v, j) => (j === i ? v + 1 : v)));
            }}
            style={{ width: "120px", height: "120px", padding: 0, border: "none", overflow: "hidden", cursor: "pointer", background: "none", transform: `rotate(${r * 90}deg)`, transition: "transform .3s cubic-bezier(.3,1.4,.5,1)", touchAction: "manipulation" }}
          >
            <div style={{ marginLeft: `${-(i % 2) * 120}px`, marginTop: `${-Math.floor(i / 2) * 120}px` }}>
              <MapArt />
            </div>
          </button>
        ))}
      </div>
      <Feedback text={solved ? "Ahí es." : "Toca un pedazo para girarlo."} tone={solved ? "ok" : "info"} />
    </div>
  );
}

// ---------- bring: repeat the brew ----------

const INGREDIENTS = [
  { name: "Ojo de sapo", c: "#8fd14f" },
  { name: "Calabaza", c: "#f08a3c" },
  { name: "Belladona", c: "#9b6bd6" },
  { name: "Sangre", c: "#c8322a" },
];
const BREW_ROUNDS = [3, 4, 5];

function BrewGame({ onWin, onFail }: GameProps) {
  const [seq] = useState(() => Array.from({ length: 5 }, () => Math.floor(Math.random() * 4)));
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const [show, setShow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [msg, setMsg] = useState<{ t: string; tone: "bad" | "ok" | "info" }>({ t: "Observa el caldero…", tone: "info" });
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const len = BREW_ROUNDS[round];
    // `playing`/`pos` are reset by whoever starts the round (pick), not here.
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < len; i++) {
      timers.push(
        setTimeout(() => {
          setShow(seq[i]);
          sfx.bubble(seq[i]);
        }, 700 + i * 700),
      );
      timers.push(setTimeout(() => setShow(null), 700 + i * 700 + 450));
    }
    timers.push(
      setTimeout(() => {
        setPlaying(false);
        setMsg({ t: "Tu turno.", tone: "info" });
      }, 700 + len * 700),
    );
    return () => timers.forEach(clearTimeout);
  }, [round, replay, seq]);

  const pick = (k: number) => {
    if (playing) return;
    setShow(k);
    sfx.bubble(k);
    setTimeout(() => setShow((s) => (s === k ? null : s)), 220);
    if (k !== seq[pos]) {
      onFail();
      setMsg({ t: "El brebaje se agria. Otra vez…", tone: "bad" });
      setPlaying(true);
      setPos(0);
      setTimeout(() => setReplay((n) => n + 1), 900);
      return;
    }
    const next = pos + 1;
    if (next < BREW_ROUNDS[round]) return setPos(next);
    if (round === BREW_ROUNDS.length - 1) {
      setPlaying(true);
      setMsg({ t: "¡Brebaje perfecto!", tone: "ok" });
      return onWin();
    }
    setPlaying(true);
    setPos(0);
    sfx.chime();
    setMsg({ t: "Burbujea… sigue.", tone: "ok" });
    setTimeout(() => setRound((r) => r + 1), 700);
  };

  const glow = show === null ? "rgba(120,220,90,.18)" : INGREDIENTS[show].c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
      <div style={{ position: "relative", width: "150px", height: "110px" }}>
        <div style={{ position: "absolute", left: "15px", right: "15px", top: "8px", height: "26px", borderRadius: "50%", background: glow, boxShadow: `0 0 ${show === null ? 14 : 34}px ${show === null ? 4 : 12}px ${glow}`, transition: "background .15s, box-shadow .15s" }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: "18px", bottom: 0, borderRadius: "20px 20px 60px 60px", background: "linear-gradient(180deg,#2a2622,#141210)" }} />
        <div style={{ position: "absolute", left: "6px", right: "6px", top: "14px", height: "10px", borderRadius: "6px", background: "#3a342e" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", width: "100%" }}>
        {INGREDIENTS.map((ing, k) => (
          <button
            key={ing.name}
            type="button"
            onClick={() => pick(k)}
            disabled={playing}
            style={{ height: "56px", borderRadius: "14px", border: `1px solid ${show === k ? ing.c : "rgba(236,230,220,.18)"}`, background: show === k ? `${ing.c}33` : "#0d0b0a", color: INK, fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", cursor: playing ? "default" : "pointer", opacity: playing && show !== k ? 0.55 : 1, transition: "opacity .2s", touchAction: "manipulation" }}
          >
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: ing.c }} />
            {ing.name}
          </button>
        ))}
      </div>
      <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: INK_3 }}>
        Ronda {round + 1}/3
      </div>
      <Feedback text={msg.t} tone={msg.tone} />
    </div>
  );
}

// ---------- theme: mask memory ----------

const MASKS = ["🎃", "💀", "👺"];

function MaskGame({ onWin, onFail }: GameProps) {
  const [deck] = useState(() => {
    const d = [...MASKS, ...MASKS];
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  });
  const [up, setUp] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);

  const flip = (i: number) => {
    if (up.length === 2 || up.includes(i) || found.includes(deck[i])) return;
    sfx.flip();
    const next = [...up, i];
    setUp(next);
    if (next.length < 2) return;
    const [a, b] = next;
    if (deck[a] === deck[b]) {
      const f = [...found, deck[a]];
      setFound(f);
      sfx.chime();
      setUp([]);
      if (f.length === MASKS.length) setTimeout(onWin, 300);
    } else {
      onFail();
      setTimeout(() => setUp([]), 750);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 84px)", gap: "10px", perspective: "600px" }}>
        {deck.map((m, i) => {
          const open = up.includes(i) || found.includes(m);
          return (
            <button
              key={i}
              type="button"
              aria-label={open ? m : "Carta boca abajo"}
              onClick={() => flip(i)}
              style={{ position: "relative", width: "84px", height: "108px", padding: 0, border: "none", background: "none", cursor: "pointer", transformStyle: "preserve-3d", transform: open ? "rotateY(180deg)" : "none", transition: "transform .4s cubic-bezier(.3,1.2,.5,1)", touchAction: "manipulation" }}
            >
              <span style={{ position: "absolute", inset: 0, borderRadius: "12px", backfaceVisibility: "hidden", background: "repeating-linear-gradient(45deg,#26221f 0 6px,#1d1a17 6px 12px)", border: "1px solid rgba(236,230,220,.14)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--pt-serif)", fontSize: "26px", color: "#6a6158" }}>
                ?
              </span>
              <span style={{ position: "absolute", inset: 0, borderRadius: "12px", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: found.includes(m) ? "rgba(217,87,59,.18)" : "#0d0b0a", border: `1px solid ${found.includes(m) ? "#d9573b" : "rgba(236,230,220,.18)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px" }}>
                {m}
              </span>
            </button>
          );
        })}
      </div>
      <Feedback text={found.length ? `${found.length}/${MASKS.length} parejas` : "Toca dos cartas."} tone={found.length ? "ok" : "info"} />
    </div>
  );
}
