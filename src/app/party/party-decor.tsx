/*
 * Atmosphere for the /party invitation (not in the design — founder,
 * 2026-09-28: "más 3D, árboles, hierbas…").
 *
 * <WorldDecor/> lives INSIDE the isometric floor (preserve-3d): flat things
 * (contact shadows, leaves, pumpkin light pools) lie on the ground; standing
 * things (trees, grass, pumpkins) are billboards — planes stood up with
 * rotateX(-90deg) and turned rotateZ(-45deg) so they face the fixed camera,
 * like the tombs. Everything is pointer-events:none so taps reach the tombs.
 *
 * <LandingDecor/> frames the gate on the landing: a foreground dead tree, a
 * branch across the moon, bats, and out-of-focus grass in front.
 *
 * All shapes are generated once at module load from a seeded PRNG.
 */
import type { CSSProperties, ReactNode } from "react";
import { GRASS, LEAVES, PUMPKINS, SHADOWS, TREES } from "./party-decor-data";
import { mulberry32 } from "./party-path";

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- procedural dead tree ----------

type TreeArt = { body: string[]; rim: { d: string; w: number }[]; vbW: number; vbH: number };

function makeTree(seed: number, depth: number, spread: number, lean = 0, trunk = 15): TreeArt {
  const rand = mulberry32(seed);
  const vbW = 220,
    vbH = 280;
  const body: string[] = [];
  const rim: { d: string; w: number }[] = [];
  const branch = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    // Two segments with a kink: branches that zig-zag read as old and dead.
    const kink = (rand() - 0.5) * 0.5;
    const mx = x + Math.sin(a) * len * 0.5,
      my = y - Math.cos(a) * len * 0.5;
    const a2 = a + kink;
    const x2 = mx + Math.sin(a2) * len * 0.5,
      y2 = my - Math.cos(a2) * len * 0.5;
    const w2 = w * 0.66,
      wm = (w + w2) / 2;
    const n = (ang: number, ww: number) => [Math.cos(ang) * ww * 0.5, Math.sin(ang) * ww * 0.5];
    const [n0x, n0y] = n(a, w),
      [nmx, nmy] = n((a + a2) / 2, wm),
      [n2x, n2y] = n(a2, w2);
    body.push(
      `M${r1(x - n0x)} ${r1(y - n0y)} L${r1(mx - nmx)} ${r1(my - nmy)} L${r1(x2 - n2x)} ${r1(y2 - n2y)} L${r1(x2 + n2x)} ${r1(y2 + n2y)} L${r1(mx + nmx)} ${r1(my + nmy)} L${r1(x + n0x)} ${r1(y + n0y)}Z`,
    );
    // Moonlight catches the right flank of every limb: that's the 3D.
    rim.push({ d: `M${r1(x + n0x * 0.55)} ${r1(y + n0y * 0.55)} L${r1(mx + nmx * 0.55)} ${r1(my + nmy * 0.55)} L${r1(x2 + n2x * 0.55)} ${r1(y2 + n2y * 0.55)}`, w: r1(Math.max(0.5, w * 0.22)) });
    if (d === 0) return;
    const kids = d > 3 ? 2 : rand() < 0.45 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const side = kids === 2 ? (k ? 1 : -1) : k - 1;
      branch(x2, y2, a2 + side * spread * (0.55 + rand() * 0.5) + (rand() - 0.5) * 0.25, len * (0.66 + rand() * 0.18), w2, d - 1);
    }
  };
  // Root flare.
  body.push(`M${vbW / 2 - 16} ${vbH} Q${vbW / 2 - 7} ${vbH - 8} ${vbW / 2 - 6} ${vbH - 26} L${vbW / 2 + 6} ${vbH - 26} Q${vbW / 2 + 8} ${vbH - 8} ${vbW / 2 + 18} ${vbH}Z`);
  branch(vbW / 2, vbH - 2, lean, 78, trunk, depth);
  return { body, rim, vbW, vbH };
}

const WORLD_TREES = [makeTree(11, 4, 0.55, 0, 26), makeTree(29, 4, 0.7, 0.12, 28), makeTree(47, 4, 0.5, -0.1, 24)];
const LANDING_TREE = makeTree(83, 6, 0.62, 0.28);

function Tree({ art, fill, rimColor, style }: { art: TreeArt; fill: string; rimColor: string; style?: CSSProperties }) {
  return (
    <svg viewBox={`0 0 ${art.vbW} ${art.vbH}`} style={{ display: "block", overflow: "visible", ...style }} aria-hidden>
      {art.body.map((d, i) => (
        <path key={i} d={d} fill={fill} />
      ))}
      {art.rim.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={rimColor} strokeWidth={r.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

// ---------- grass, pumpkin ----------

function makeGrass(seed: number) {
  const rand = mulberry32(seed);
  const blades: { d: string; dry: boolean }[] = [];
  const n = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const bx = 8 + rand() * 24,
      h = 12 + rand() * 16,
      lean = (rand() - 0.5) * 16;
    const tx = bx + lean,
      ty = 30 - h;
    blades.push({
      d: `M${r1(bx - 1.6)} 30 Q${r1(bx + lean * 0.3 - 0.5)} ${r1(30 - h * 0.5)} ${r1(tx)} ${r1(ty)} Q${r1(bx + lean * 0.3 + 0.8)} ${r1(30 - h * 0.5)} ${r1(bx + 1.6)} 30Z`,
      dry: rand() < 0.25,
    });
  }
  return blades;
}
const GRASS_ART = [makeGrass(3), makeGrass(5), makeGrass(8), makeGrass(13)];

function Grass({ v, gid }: { v: number; gid: string }) {
  return (
    <svg viewBox="0 0 40 30" width="40" height="30" style={{ display: "block", overflow: "visible" }} aria-hidden>
      {GRASS_ART[v % GRASS_ART.length].map((b, i) => (
        <path key={i} d={b.d} fill={b.dry ? "#57513a" : `url(#${gid})`} />
      ))}
    </svg>
  );
}

function Pumpkin() {
  return (
    <svg viewBox="0 0 40 34" width="40" height="34" style={{ display: "block", overflow: "visible" }} aria-hidden>
      <path d="M19 7 q1 -5 5 -6" stroke="#3b4a24" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="11" cy="21" rx="9" ry="12" fill="#b4531c" />
      <ellipse cx="29" cy="21" rx="9" ry="12" fill="#a8491a" />
      <ellipse cx="20" cy="20" rx="10" ry="13" fill="#d06a24" />
      <ellipse cx="17" cy="16" rx="3" ry="8" fill="#e58a3a" opacity=".45" />
      <g style={{ animation: "pt-candle 1.2s ease-in-out infinite", transformOrigin: "20px 24px" }}>
        <path d="M11 17 l4 -5 l3 5Z M22 17 l4 -5 l3 5Z" fill="#ffd35a" />
        <path d="M10 24 l4 3 l3 -3 l3 3 l3 -3 l3 3 l4 -3 l-2 5 l-15 0Z" fill="#ffc24a" />
      </g>
    </svg>
  );
}

// ---------- world ----------

/** A plane standing up at world point (x, y), facing the isometric camera. */
function Billboard({ x, y, w, h, children, style }: { x: number; y: number; w: number; h: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, transformStyle: "preserve-3d", pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: -w / 2, top: -h, width: w, height: h, transformOrigin: "50% 100%", transform: "rotateZ(-45deg) rotateX(-90deg)", ...style }}>
        {children}
      </div>
    </div>
  );
}

const flat: CSSProperties = { position: "absolute", pointerEvents: "none" };
const LEAF_COLORS = ["#8a3b1c", "#b5651d", "#6e3a1a", "#9c4a1f"];
const TREE_SIZE = [
  [190, 240],
  [220, 280],
  [170, 215],
];

/** Ground fog banks: [x, y, drift seconds] — spread over the yard, low and slow. */
const FOG: [number, number, number][] = [
  [300, 300, 26], [800, 250, 31], [1250, 250, 23], [180, 700, 29], [650, 800, 24], [1100, 750, 33],
  [1450, 650, 27], [350, 1150, 30], [850, 1150, 22], [1250, 1050, 28], [600, 1450, 34], [1150, 1450, 25],
];

export function WorldDecor() {
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <linearGradient id="pt-grass" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#10160e" />
            <stop offset=".6" stopColor="#26331f" />
            <stop offset="1" stopColor="#415235" />
          </linearGradient>
        </defs>
      </svg>
      {/* Contact shadows: the moon is up-right on screen, so they fall toward +y. */}
      {SHADOWS.map(([x, y, w, len], i) => (
        <div key={`s${i}`} style={{ ...flat, left: x, top: y, width: w, height: len, background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(0,0,0,.62), rgba(0,0,0,.28) 50%, transparent 80%)" }} />
      ))}
      {TREES.map(([x, y], i) => (
        <div key={`ts${i}`} style={{ ...flat, left: x - 22, top: y - 4, width: 44, height: 230, background: "radial-gradient(ellipse 50% 100% at 50% 0%, rgba(0,0,0,.5), rgba(0,0,0,.18) 55%, transparent 85%)" }} />
      ))}
      {PUMPKINS.map(([x, y], i) => (
        <div key={`pg${i}`} style={{ ...flat, left: x - 70, top: y - 70, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,160,70,.32), rgba(255,120,40,.1) 45%, transparent 70%)", animation: `pt-candle ${1.3 + (i % 3) * 0.2}s ease-in-out infinite` }} />
      ))}
      {LEAVES.map(([x, y, rot, c], i) => (
        <div key={`l${i}`} style={{ ...flat, left: x, top: y, width: 9, height: 4, borderRadius: "50%", background: LEAF_COLORS[c], opacity: 0.8, transform: `rotate(${rot}deg)` }} />
      ))}
      {GRASS.map(([x, y, v], i) => (
        <Billboard key={`g${i}`} x={x} y={y} w={40} h={30} style={{ animation: `pt-sway ${4 + (i % 5) * 0.7}s ease-in-out infinite`, animationDelay: `${(i % 7) * -0.6}s` }}>
          <Grass v={v} gid="pt-grass" />
        </Billboard>
      ))}
      {TREES.map(([x, y, v], i) => {
        const [w, h] = TREE_SIZE[v];
        return (
          <Billboard key={`t${i}`} x={x} y={y} w={w} h={h}>
            <Tree art={WORLD_TREES[v]} fill="#0f0d0c" rimColor="rgba(200,190,175,.22)" style={{ width: "100%", height: "100%" }} />
          </Billboard>
        );
      })}
      {PUMPKINS.map(([x, y], i) => (
        <Billboard key={`p${i}`} x={x} y={y} w={40} h={34}>
          <Pumpkin />
        </Billboard>
      ))}
      {/* Low fog: translucent banks standing in the yard, drifting sideways. */}
      {FOG.map(([x, y, dur], i) => (
        <Billboard key={`f${i}`} x={x} y={y} w={380} h={80}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 60% at 50% 72%, rgba(200,194,186,.2), rgba(190,184,176,.08) 55%, transparent 75%)", animation: `${i % 2 ? "pt-fogDrift" : "pt-fogDrift2"} ${dur}s ease-in-out infinite alternate`, animationDelay: `${-i * 3}s` }} />
        </Billboard>
      ))}
    </>
  );
}

// ---------- landing ----------

function Bat({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 40 18" width={size} height={size * 0.45} style={{ display: "block", animation: "pt-flap .22s ease-in-out infinite alternate", transformOrigin: "50% 40%" }} aria-hidden>
      <path d="M20 6 c-2 -3 -4 -3 -5 0 c-3 -3 -9 -5 -15 -2 c4 1 6 4 6 7 c2 -2 5 -2 6 0 c1 -2 3 -2 4 0 l4 3 l4 -3 c1 -2 3 -2 4 0 c1 -2 4 -2 6 0 c0 -3 2 -6 6 -7 c-6 -3 -12 -1 -15 2 c-1 -3 -3 -3 -5 0Z" fill="#0a0808" />
    </svg>
  );
}

const BATS = [
  { top: "9%", dur: 11, delay: 0, size: 26 },
  { top: "17%", dur: 15, delay: 4, size: 18 },
  { top: "5%", dur: 19, delay: 9, size: 14 },
];

/** Section-level layers (bats, branch, out-of-focus grass). Rendered in the landing <section>. */
export function LandingSky() {
  return (
    <>
      {BATS.map((b, i) => (
        <div key={i} style={{ position: "absolute", left: 0, top: b.top, zIndex: 2, pointerEvents: "none", animation: `pt-batfly ${b.dur}s linear ${b.delay}s infinite`, opacity: 0 }}>
          <Bat size={b.size} />
        </div>
      ))}
      {/* A dead branch reaching in from the right, across the moon. */}
      <svg viewBox="0 0 220 120" style={{ position: "absolute", right: 0, top: "calc(34px + env(safe-area-inset-top))", width: "min(62vw, 300px)", zIndex: 2, pointerEvents: "none", transformOrigin: "100% 20%", animation: "pt-swing 9s ease-in-out infinite" }} aria-hidden>
        <path d="M220 18 C 180 22, 150 30, 120 44 C 100 52, 80 58, 52 60 C 40 61, 30 66, 18 76 L 20 78 C 34 70, 44 66, 56 66 C 84 66, 104 60, 124 52 C 150 42, 182 34, 220 32Z" fill="#070606" />
        <path d="M150 34 C 146 20, 140 12, 132 4 M 118 46 C 120 60, 118 74, 110 88 M 86 60 C 82 50, 74 44, 64 40 M 70 64 C 70 76, 66 86, 58 96 M 180 28 C 184 40, 186 52, 184 64" stroke="#070606" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M112 88 l-4 10 M 60 96 l-6 6 M 184 64 l2 8" stroke="#070606" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M220 20 C 180 24, 150 32, 121 45" stroke="rgba(233,226,210,.18)" strokeWidth="1.2" fill="none" />
      </svg>
      {/* Out-of-focus grass in front of everything: depth of field. */}
      <div style={{ position: "absolute", left: "-4%", right: "-4%", bottom: "-6px", height: "70px", zIndex: 7, pointerEvents: "none", filter: "blur(2.5px)", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} style={{ width: `${48 + ((i * 37) % 30)}px`, height: `${34 + ((i * 53) % 36)}px`, transformOrigin: "50% 100%", animation: `pt-sway ${4.5 + (i % 4) * 0.6}s ease-in-out infinite`, animationDelay: `${-i * 0.4}s` }}>
            <svg viewBox="0 0 40 30" preserveAspectRatio="none" width="100%" height="100%" style={{ display: "block" }} aria-hidden>
              {GRASS_ART[i % GRASS_ART.length].map((b, k) => (
                <path key={k} d={b.d} fill="#050404" />
              ))}
            </svg>
          </div>
        ))}
      </div>
    </>
  );
}

/** Inside the 300×372 gate box: the foreground tree framing the gate's left side. */
export function LandingTree() {
  return (
    <div style={{ position: "absolute", left: "-150px", bottom: "-18px", width: "260px", height: "400px", zIndex: 5, pointerEvents: "none" }}>
      <Tree art={LANDING_TREE} fill="#060505" rimColor="rgba(255,190,110,.16)" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ---------- sealed secret faces ----------

export type SealKind = "host" | "date" | "place" | "bring" | "theme";

/** Abstract sigils — one per secret so each sealed stone is recognisable, none hinting at its answer. */
const SIGILS: Record<SealKind, string> = {
  host: "M20 8 L32 30 L8 30Z M20 17 L20 24 M20 27 v.5",
  date: "M26 9 A12 12 0 1 0 26 31 A9 9 0 1 1 26 9Z M12 20 h3 M20 20 h2",
  place: "M20 6 L23 17 L34 20 L23 23 L20 34 L17 23 L6 20 L17 17Z",
  bring: "M20 7 L33 31 L7 31Z M11 23 H29 M20 7 V2",
  theme: "M13 10 A10 10 0 0 0 13 30 A7 7 0 0 1 13 10Z M27 10 A10 10 0 0 1 27 30 A7 7 0 0 0 27 10Z M20 12 V28",
};

/**
 * What a secret tomb shows until its minigame is won: chains across the
 * face, a glowing ember sigil and "SELLADA". No text of the answer. It's an
 * overlay on the face; the engraving underneath stays hidden (opacity 0,
 * blurred) until `broken`. Breaking plays once, by CSS transitions: the
 * chains drop, the medallion bursts and fades, then the engraving surfaces.
 * Transitions don't run on mount, so a secret found on a previous visit just
 * renders broken.
 */
export function SealedFace({ kind, size, label = true, broken = false }: { kind: SealKind; size: number; label?: boolean; broken?: boolean }) {
  const chain = (rot: number, fall: number) => (
    <div
      style={{
        position: "absolute",
        left: "-20%",
        right: "-20%",
        top: "50%",
        height: "8px",
        marginTop: "-4px",
        transform: broken ? `translateY(160%) rotate(${rot + fall}deg)` : `rotate(${rot}deg)`,
        opacity: broken ? 0 : 0.85,
        transition: "transform .9s cubic-bezier(.55,0,.85,.4), opacity .5s ease .45s",
        background: "radial-gradient(ellipse 5px 3.2px at 5px 4px, transparent 55%, #6a6158 60%, #3a342e 95%, transparent 100%) 0 0 / 9px 8px repeat-x",
      }}
    />
  );
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit" }}>
        {chain(28, 34)}
        {chain(-28, -30)}
      </div>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle, #2a1510 0 55%, #1a1411 70%)",
          boxShadow: broken ? "0 0 0 2px #4a433c, 0 0 30px 12px rgba(255,140,70,.7)" : "0 0 0 2px #4a433c, inset 0 2px 4px rgba(0,0,0,.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: broken ? "scale(1.5)" : "scale(1)",
          opacity: broken ? 0 : 1,
          transition: "transform .8s cubic-bezier(.2,.8,.2,1) .15s, opacity .7s ease .35s, box-shadow .25s ease .1s",
        }}
      >
        <svg viewBox="0 0 40 40" width={size * 0.72} height={size * 0.72} style={{ display: "block", overflow: "visible", animation: "pt-ember 3.2s ease-in-out infinite", filter: "drop-shadow(0 0 3px rgba(255,110,50,.9))" }} aria-hidden>
          <circle cx="20" cy="20" r="17" fill="none" stroke="#ff8a4a" strokeWidth="1.2" opacity=".55" />
          <path d={SIGILS[kind]} fill="none" stroke="#ffb070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {label ? (
        <div style={{ position: "relative", marginTop: Math.round(size * 0.14), fontFamily: "var(--pt-serif)", fontSize: Math.max(8, Math.round(size * 0.17)), letterSpacing: ".35em", color: "#8a7f73", opacity: broken ? 0 : 1, transition: "opacity .4s" }}>
          SELLADA
        </div>
      ) : null}
    </div>
  );
}

// ---------- teaser: chained gate ----------

/** Oval links along a line, alternating flat/edge-on like a real chain. */
function chainLinks(x1: number, y1: number, x2: number, y2: number, sag = 0) {
  const out: { x: number; y: number; a: number; flat: boolean }[] = [];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.floor(len / 8.5);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t + sag * 4 * t * (1 - t);
    const dy = (y2 - y1) / len + (sag * 4 * (1 - 2 * t)) / len;
    const a = (Math.atan2(dy * len, x2 - x1) * 180) / Math.PI;
    out.push({ x: r1(x), y: r1(y), a: Math.round(a), flat: i % 2 === 0 });
  }
  return out;
}
const CHAINS = [chainLinks(-6, 64, 218, 176, 10), chainLinks(-6, 176, 218, 64, 10), chainLinks(-10, 118, 222, 118, 18)];

/**
 * Teaser mode (PARTY_EVENT.locked): chains crossed over the gate doors with an
 * old brass padlock. `rattle` is a counter — each tap bumps it, which remounts
 * the shaking group and replays the rattle once.
 */
export function GateChains({ rattle }: { rattle: number }) {
  return (
    <div style={{ position: "absolute", left: "44px", right: "44px", bottom: 0, height: "238px", zIndex: 3, pointerEvents: "none" }}>
      <svg key={rattle} viewBox="0 0 212 238" width="100%" height="100%" style={{ display: "block", overflow: "visible", animation: rattle ? "pt-rattle .5s ease-out" : "none", transformOrigin: "50% 50%" }} aria-hidden>
        <defs>
          <linearGradient id="pt-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a8926a" />
            <stop offset=".45" stopColor="#6e5c3d" />
            <stop offset="1" stopColor="#3a3022" />
          </linearGradient>
        </defs>
        {CHAINS.map((links, c) => (
          <g key={c}>
            {links.map((l, i) => (
              <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.a})`}>
                {l.flat ? (
                  <>
                    <ellipse rx="5.4" ry="3" fill="none" stroke="#1a1714" strokeWidth="2.6" />
                    <ellipse rx="5.4" ry="3" fill="none" stroke="#6f6860" strokeWidth="1.5" />
                    <path d="M-3.5 -2.3 Q0 -3.4 3.5 -2.3" fill="none" stroke="#b8ad9f" strokeWidth=".7" opacity=".7" />
                  </>
                ) : (
                  <rect x="-5.2" y="-1.1" width="10.4" height="2.2" rx="1.1" fill="#4a433c" stroke="#1a1714" strokeWidth=".6" />
                )}
              </g>
            ))}
          </g>
        ))}
        {/* Padlock where the chains cross. */}
        <g transform="translate(106 128)">
          <path d="M-9 -4 V-13 A9 9 0 0 1 9 -13 V-4" fill="none" stroke="#1a1714" strokeWidth="5.5" />
          <path d="M-9 -4 V-13 A9 9 0 0 1 9 -13 V-4" fill="none" stroke="#7a7066" strokeWidth="3.2" />
          <rect x="-15" y="-5" width="30" height="26" rx="4" fill="url(#pt-brass)" stroke="#1a1714" strokeWidth="1.2" />
          <rect x="-12" y="-2.5" width="24" height="2" rx="1" fill="#c9b48a" opacity=".45" />
          <circle cx="0" cy="7" r="3.2" fill="#140f0a" />
          <path d="M-1.4 8 L1.4 8 L0.8 14 L-0.8 14Z" fill="#140f0a" />
          <path d="M-13 17 Q-6 12 2 18" fill="none" stroke="#5a3a1e" strokeWidth="1.4" opacity=".6" />
        </g>
      </svg>
    </div>
  );
}
