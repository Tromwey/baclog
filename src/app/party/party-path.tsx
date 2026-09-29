/*
 * The cobblestone path behind the gate on the /party landing (replaces the
 * design's flat grid, which read as a wall, not a floor). Real perspective:
 * rows are evenly spaced in DEPTH (1/y), so stones shrink toward the crypt;
 * worn lighter stones down the middle, moss on the verges, a few dead leaves,
 * warm light from the crypt door and fog on the horizon.
 *
 * Generated once at module load with a seeded PRNG — stable across renders.
 * Drawn in the gate's ground box: 212 × 148 (62% of the 238px arch).
 */

const W = 212;
const H = 148;
// Trapezoid of the path: narrow at the horizon, wide at the viewer.
const TOP_L = W * 0.45,
  TOP_R = W * 0.55,
  BOT_L = W * 0.04,
  BOT_R = W * 0.96;

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const xl = (y: number) => TOP_L + (BOT_L - TOP_L) * (y / H);
const xr = (y: number) => TOP_R + (BOT_R - TOP_R) * (y / H);
const r1 = (n: number) => Math.round(n * 10) / 10;

type Stone = { d: string; fill: string; lit: string; litD: string };
type Blob = { cx: number; cy: number; rx: number; ry: number; rot: number; fill: string; op: number };

function build() {
  const rand = mulberry32(31102026);
  const stones: Stone[] = [];
  const moss: Blob[] = [];
  const leaves: Blob[] = [];

  // Row boundaries evenly spaced in depth: y = H / (1 + k·Δ).
  const ys: number[] = [];
  for (let k = 0; ; k++) {
    const y = H / (1 + k * 0.17);
    if (ys.length && ys[ys.length - 1] - y < 1.4) break;
    ys.push(y);
  }
  ys.reverse(); // far → near

  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i],
      y1 = ys[i + 1];
    const rowH = y1 - y0;
    // Cobbles ~1.5× wider than deep, whatever the row's distance.
    const ACROSS = Math.max(2, Math.round((xr(y1) - xl(y1)) / (rowH * 1.5)));
    const gap = Math.max(0.5, rowH * 0.14);
    const near = y1 / H; // 0 far … 1 near
    // Uneven joints: random stone widths, staggered start, so no grid shows.
    const cuts = [0];
    let u = -(0.2 + rand() * 0.6) / ACROSS;
    while (u < 1) {
      u += (0.65 + rand() * 0.7) / ACROSS;
      if (u > 0.04 && u < 0.96) cuts.push(u);
    }
    cuts.push(1);
    for (let j = 0; j < cuts.length - 1; j++) {
      const a = cuts[j],
        b = cuts[j + 1];
      const jit = () => (rand() - 0.5) * rowH * 0.18;
      const top = y0 + gap / 2,
        bot = y1 - gap / 2;
      const p = (u: number, y: number) => xl(y) + (xr(y) - xl(y)) * u;
      const gu = (gap / (xr(y1) - xl(y1))) * 0.9;
      const ua = a + (a > 0 ? gu : 0.012),
        ub = b - (b < 1 ? gu : 0.012);
      const pts = [
        [p(ua, top) + jit(), top + jit() * 0.3],
        [p(ub, top) + jit(), top + jit() * 0.3],
        [p(ub, bot) + jit(), bot + jit() * 0.3],
        [p(ua, bot) + jit(), bot + jit() * 0.3],
      ];
      // Rounded rectangle, not an oval: only the corners are curved.
      const R = 0.2 + rand() * 0.12;
      const lerp = (q: number[], w: number[], t: number) => [q[0] + (w[0] - q[0]) * t, q[1] + (w[1] - q[1]) * t];
      const into = pts.map((q, k) => lerp(q, pts[(k + 3) % 4], R)); // toward previous corner
      const out = pts.map((q, k) => lerp(q, pts[(k + 1) % 4], R)); // toward next corner
      const d =
        `M${r1(out[0][0])} ${r1(out[0][1])}` +
        [1, 2, 3, 0]
          .map((k) => ` L${r1(into[k][0])} ${r1(into[k][1])} Q${r1(pts[k][0])} ${r1(pts[k][1])} ${r1(out[k][0])} ${r1(out[k][1])}`)
          .join("") +
        "Z";
      // Worn centre: stones near u=.5 are lighter; far rows sink into the dark.
      const centre = 1 - Math.abs((a + b) / 2 - 0.5) * 2;
      const tone = 0.3 + near * 0.42 + centre * 0.16 + (rand() - 0.5) * 0.3;
      const c = (base: number, span: number) => Math.round(base + span * Math.min(1, Math.max(0, tone)));
      const fill = `rgb(${c(34, 70)},${c(28, 56)},${c(24, 44)})`;
      const lit = `rgba(255,190,130,${r1(0.12 + (1 - near) * 0.25)})`;
      const litD = `M${r1(pts[0][0] + 1)} ${r1(pts[0][1] + 0.4)} L${r1(pts[1][0] - 1)} ${r1(pts[1][1] + 0.4)}`;
      stones.push({ d, fill, lit, litD });
      // Moss creeping into the joints near the verges.
      if ((a === 0 || b === 1) && rand() < 0.75) {
        const u = a === 0 ? ua : ub;
        moss.push({ cx: r1(p(u, bot)), cy: r1(bot), rx: r1(rowH * (0.5 + rand() * 0.6)), ry: r1(rowH * 0.22), rot: 0, fill: "#2d3a24", op: 0.9 });
      }
    }
  }

  for (let i = 0; i < 7; i++) {
    const y = H * (0.35 + rand() * 0.62);
    const u = 0.15 + rand() * 0.7;
    const s = 0.5 + (y / H) * 1.1;
    leaves.push({
      cx: r1(xl(y) + (xr(y) - xl(y)) * u),
      cy: r1(y),
      rx: r1(2.6 * s),
      ry: r1(1.2 * s),
      rot: Math.round(rand() * 180),
      fill: ["#8a3b1c", "#b5651d", "#6e3a1a", "#9c4a1f"][i % 4],
      op: 0.85,
    });
  }

  // Ragged verges: the path edge, eaten in by grass.
  const verge = (side: "l" | "r") => {
    const pts: string[] = [];
    const N = 22;
    for (let k = 0; k <= N; k++) {
      const y = (H * k) / N;
      const bite = (1 + rand() * 4) * (0.3 + y / H);
      const x = side === "l" ? xl(y) + bite : xr(y) - bite;
      pts.push(`${r1(x)},${r1(y)}`);
    }
    return side === "l" ? `0,0 ${pts.join(" ")} 0,${H}` : `${W},0 ${pts.join(" ")} ${W},${H}`;
  };

  const tufts: string[] = [];
  for (let k = 0; k < 14; k++) {
    const left = k % 2 === 0;
    const y = H * (0.25 + rand() * 0.75);
    const s = 1 + (y / H) * 3.5;
    const x = left ? xl(y) + s * 0.6 : xr(y) - s * 0.6;
    tufts.push(
      `M${r1(x - s)} ${r1(y)} L${r1(x - s * 0.4)} ${r1(y - s * 2.2)} L${r1(x)} ${r1(y - s * 0.6)} L${r1(x + s * 0.5)} ${r1(y - s * 2.6)} L${r1(x + s)} ${r1(y)}Z`,
    );
  }

  return { stones, moss, leaves, vergeL: verge("l"), vergeR: verge("r"), tufts };
}

const ART = build();
const PATH_POLY = `${TOP_L},0 ${TOP_R},0 ${BOT_R},${H} ${BOT_L},${H}`;

export function PartyPath() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "62%", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="pt-path-mortar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c0a09" />
          <stop offset="1" stopColor="#171210" />
        </linearGradient>
        <radialGradient id="pt-path-glow" cx="50%" cy="0%" r="75%">
          <stop offset="0" stopColor="rgba(232,120,93,.38)" />
          <stop offset=".45" stopColor="rgba(217,87,59,.1)" />
          <stop offset="1" stopColor="rgba(217,87,59,0)" />
        </radialGradient>
        <linearGradient id="pt-path-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(150,144,138,.5)" />
          <stop offset=".3" stopColor="rgba(150,144,138,.12)" />
          <stop offset=".55" stopColor="rgba(150,144,138,0)" />
        </linearGradient>
        <linearGradient id="pt-path-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".6" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,.45)" />
        </linearGradient>
        <clipPath id="pt-path-clip">
          <polygon points={PATH_POLY} />
        </clipPath>
      </defs>
      {/* grass either side */}
      <rect width={W} height={H} fill="#161d14" />
      <g clipPath="url(#pt-path-clip)">
        <rect width={W} height={H} fill="url(#pt-path-mortar)" />
        {ART.stones.map((s, i) => (
          <g key={i}>
            <path d={s.d} fill={s.fill} />
            <path d={s.litD} stroke={s.lit} strokeWidth=".7" strokeLinecap="round" />
          </g>
        ))}
        {ART.moss.map((b, i) => (
          <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={b.fill} opacity={b.op} />
        ))}
        {ART.leaves.map((b, i) => (
          <ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={b.fill} opacity={b.op} transform={`rotate(${b.rot} ${b.cx} ${b.cy})`} />
        ))}
        <rect width={W} height={H} fill="url(#pt-path-glow)" />
      </g>
      <polygon points={ART.vergeL} fill="#1c2419" />
      <polygon points={ART.vergeR} fill="#1c2419" />
      {ART.tufts.map((d, i) => (
        <path key={i} d={d} fill={i % 3 ? "#25301f" : "#2d3a24"} />
      ))}
      <rect width={W} height={H} fill="url(#pt-path-fog)" />
      <rect width={W} height={H} fill="url(#pt-path-shade)" />
    </svg>
  );
}
