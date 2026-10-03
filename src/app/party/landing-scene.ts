/*
 * The /party landing's 3D scene — a line-for-line port of the design's module
 * script (Claude Design 383601c9…, "proto/Fase 2c - Intro linterna.html"):
 * first-person camera in front of the cemetery gate, procedural canvas
 * textures (zero downloads), fog, grass, cobwebs, the flickering lantern and
 * the flashlight. Numbers are the design's; don't "tidy" them.
 *
 * The only things that aren't in the design: `dispose()` (React unmounts), and
 * the dev toolbar's handlers exposed as methods instead of reading the DOM.
 */
import * as THREE from "three";

export type Estado = "teaser" | "revelado";
export type Capa = "tex" | "niebla" | "hierba" | "telas" | "nubes";
type Zone = "reja" | "ojos" | "luna" | "farol";
/** Sounds of the geek easter eggs (founder, 2026-10-01 — not in the design). */
export type Fx = "bonfire" | "scurry" | "static";
export type MsgMode = "objeto" | "contador" | "subtitulo";
type V3 = [number, number, number];
type Inst = { pos: V3; rot?: V3; scale?: V3 };
type Corner = "tl" | "bl" | "br" | "tr";

export interface LandingSceneOptions {
  stage: HTMLElement;
  top: HTMLElement;
  hero: HTMLElement;
  tag: HTMLElement;
  veil: HTMLElement;
  hud: HTMLElement;
  /** The floating message (modes "objeto" / "subtitulo"). */
  msg: HTMLElement;
  /** aria-live copy of every message. */
  live: HTMLElement;
  /** The "Toma esto" intro layer and the square that holds the flashlight asset. */
  intro: HTMLElement;
  introItem: HTMLElement;
  /** `?intro=0`: no intro, the flashlight starts on. */
  skipIntro: boolean;
  /** The page's AudioContext (created suspended at mount so the samples decode early); taking the flashlight resumes it. */
  audio: () => AudioContext | null;
  estado: Estado;
  /** Where a gate message shows; the design's default is "contador" (it replaces the headline). */
  msgMode: () => MsgMode;
  /** When the gate opens (the messages count down to it). */
  abre: () => Date;
  /** "contador" mode: put this message in the headline, or null to bring the base headline back. */
  flash: (text: string | null) => void;
  /** `?oscuro=0` turns the darkness off (testing). */
  dark: boolean;
  /** Where the walk through the gate ends. A `#…` href is "pending": the view resets instead. */
  href: () => string;
  onFallback: (reason: string) => void;
  /** The chained gate was tapped (teaser): it rattles. */
  onRattle: () => void;
  /** The flashlight's switch, `delay` seconds from now. False = recording not loaded, the scene synthesizes it. */
  click: (delay: number) => boolean;
  /** An easter egg wants its sound. */
  onFx: (fx: Fx) => void;
  /** The walk through the gate starts. */
  onEnter: () => void;
}

export interface LandingScene {
  dispose(): void;
  setEstado(e: Estado): void;
  walkIn(): void;
  resetView(): void;
  setZonas(on: boolean): void;
  setLinterna(on: boolean): void;
  setLinternaTam(deg: number): void;
  setLinternaInt(pct: number): void;
  setDark(on: boolean): void;
  setCapa(capa: Capa, on: boolean): void;
  /** Clears the active message (call it when the message mode changes). */
  hush(): void;
  /** Dev: shows the intro again and turns the flashlight off. */
  showIntro(): void;
}

export function initLandingScene(opts: LandingSceneOptions): LandingScene {
  const { stage, tag, veil, hud, msg, live, intro } = opts;
  const itemEl = opts.introItem;
  let estado = opts.estado;
  let disposed = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const mobile = matchMedia("(pointer:coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  const BG = 0x1d1f26;
  renderer.setClearColor(BG);
  stage.appendChild(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    if (disposed) return;
    e.preventDefault();
    renderer.setAnimationLoop(null);
    opts.onFallback("contexto WebGL perdido");
  });

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(BG, 9, 34);
  scene.fog = fog;
  const hemi = new THREE.HemisphereLight(0xb9c2d6, 0x24242a, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xdbe3ff, 1.4);
  sun.position.set(-6, 10, 8);
  scene.add(sun);

  const M = {
    suelo: new THREE.MeshLambertMaterial({ color: 0x2f2f34, name: "suelo" }),
    piedra: new THREE.MeshLambertMaterial({ color: 0x83838a, name: "piedra" }),
    piedra2: new THREE.MeshLambertMaterial({ color: 0x66666d, name: "piedra_oscura" }),
    hierro: new THREE.MeshLambertMaterial({ color: 0x3e3e44, name: "hierro" }),
    camino: new THREE.MeshLambertMaterial({ color: 0x55555b, name: "camino" }),
    hueco: new THREE.MeshLambertMaterial({ color: 0x1e1e22, name: "hueco" }),
    madera: new THREE.MeshLambertMaterial({ color: 0x5a5753, name: "madera" }),
    luz: new THREE.MeshBasicMaterial({ color: 0xf2e8cc, name: "luz" }),
    ojos: new THREE.MeshBasicMaterial({ color: 0xcfeeb0, name: "ojos" }),
    luna: new THREE.MeshBasicMaterial({ color: 0xd6d6d6, name: "luna", fog: false }),
    columna: new THREE.MeshLambertMaterial({ color: 0x83838a, name: "piedra_columna" }),
  };

  // ---------- Texturas procedurales (canvas, 0 descargas) ----------
  const t0 = performance.now();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const R = ((s: number) => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  })(91);
  const sstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let texBytes = 0;
  let texCount = 0;
  function fbm(W: number, H: number, cx: number, cy: number, oct: number) {
    const out = new Float32Array(W * H);
    let amp = 1;
    let tot = 0;
    for (let o = 0; o < oct; o++, amp *= 0.5) {
      const CX = cx << o;
      const CY = cy << o;
      const g = new Float32Array(CX * CY);
      for (let i = 0; i < g.length; i++) g[i] = R();
      for (let y = 0; y < H; y++) {
        const fy = (y / H) * CY;
        const y0 = fy | 0;
        const ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        const r0 = y0 * CX;
        const r1 = ((y0 + 1) % CY) * CX;
        for (let x = 0; x < W; x++) {
          const fx = (x / W) * CX;
          const x0 = fx | 0;
          const tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % CX;
          const a = g[r0 + x0] + (g[r0 + x1] - g[r0 + x0]) * sx;
          const b = g[r1 + x0] + (g[r1 + x1] - g[r1 + x0]) * sx;
          out[y * W + x] += amp * (a + (b - a) * sy);
        }
      }
      tot += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  type Painter = (i: number, x: number, y: number, o: number[]) => void;
  function paint(W: number, H: number, fn: Painter) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const o = [0, 0, 0, 1];
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      o[3] = 1;
      fn(i, i % W, (i / W) | 0, o);
      d[j] = o[0] * 255;
      d[j + 1] = o[1] * 255;
      d[j + 2] = o[2] * 255;
      d[j + 3] = o[3] * 255;
    }
    ctx.putImageData(img, 0, 0);
    texBytes += W * H * 5.33;
    texCount++;
    return c;
  }
  type Pair = [HTMLCanvasElement, HTMLCanvasElement];
  const withH = (W: number, H: number, fn: (i: number, x: number, y: number, o: number[]) => number): Pair => {
    const h = new Float32Array(W * H);
    const c = paint(W, H, (i, x, y, o) => {
      h[i] = fn(i, x, y, o);
    });
    return [
      c,
      paint(W, H, (i, _x, _y, o) => {
        o[0] = o[1] = o[2] = h[i];
      }),
    ];
  };
  function tex(c: HTMLCanvasElement, rep: [number, number] = [1, 1], srgb = true, clamp = false) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  // UV en metros proyectadas por cara (la textura no se estira en muros largos)
  const projUV = <G extends THREE.BufferGeometry>(g: G): G => {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i));
      const ay = Math.abs(n.getY(i));
      const az = Math.abs(n.getZ(i));
      if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
      else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
      else uv.setXY(i, p.getX(i), p.getY(i));
    }
    return g;
  };
  const stoneBlocks = () => {
    const S = 512, RW = 6, CL = 3, rh = S / RW, cw = S / CL;
    const n = fbm(S, S, 8, 8, 5), lo = fbm(S, S, 2, 2, 3), dr = fbm(S, S, 24, 2, 3);
    const br = Array.from({ length: RW * CL }, R);
    return withH(S, S, (i, x, y, o) => {
      const row = (y / rh) | 0, fy = y - row * rh, xs = x + ((row & 1) * cw) / 2, c = ((xs / cw) | 0) % CL, fx = xs % cw;
      const nn = n[i] - 0.5, e = Math.min(fx, cw - fx, fy, rh - fy) + nn * 10, bev = sstep(1, 9, e);
      const l = (0.72 + br[row * CL + c] * 0.18 + nn * 0.6) * (0.45 + 0.55 * bev) * (1 - sstep(0.52, 0.72, dr[i]) * 0.3);
      const m = sstep(0.56, 0.7, lo[i] + nn * 0.25) * 0.85;
      o[0] = l * (1 - m * 0.4);
      o[1] = l * (1 - m * 0.1);
      o[2] = l * (1 - m * 0.55);
      return 0.2 + 0.8 * bev * (0.8 + nn * 0.5);
    });
  };
  const stonePlain = () => {
    const S = 256, n = fbm(S, S, 6, 6, 5), lo = fbm(S, S, 2, 2, 3);
    return withH(S, S, (i, _x, _y, o) => {
      const nn = n[i] - 0.5, pit = sstep(0.33, 0.27, n[i]), l = (0.8 + nn * 0.65) * (1 - pit * 0.18), m = sstep(0.58, 0.7, lo[i]) * 0.75;
      o[0] = l * (1 - m * 0.4);
      o[1] = l * (1 - m * 0.1);
      o[2] = l * (1 - m * 0.55);
      return 0.5 + nn - pit * 0.12;
    });
  };
  const groundTex = () => {
    const S = 512, n = fbm(S, S, 8, 8, 6), lo = fbm(S, S, 2, 2, 3), sp = fbm(S, S, 64, 64, 1);
    return withH(S, S, (i, _x, _y, o) => {
      const nn = n[i] - 0.5, p = sstep(0.46, 0.62, lo[i]), k = sstep(0.8, 0.9, sp[i]), l = (0.82 + nn * 0.8) * (1 - p * 0.15) + k * 0.25;
      o[0] = l * (1 - p * 0.12);
      o[1] = l * (0.97 + p * 0.03);
      o[2] = l * (0.92 - p * 0.1);
      return 0.5 + nn + k * 0.4;
    });
  };
  const flagstones = () => {
    const S = 512, G = 5, n = fbm(S, S, 8, 8, 4);
    const jx: number[] = [], jy: number[] = [], tone: number[] = [];
    for (let k = 0; k < G * G; k++) {
      jx.push(0.2 + R() * 0.6);
      jy.push(0.2 + R() * 0.6);
      tone.push(R());
    }
    return withH(S, S, (i, x, y, o) => {
      const px = (x / S) * G, py = (y / S) * G, ix = Math.floor(px), iy = Math.floor(py);
      let d1 = 9, d2 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const cx = ix + di, cy = iy + dj, k = ((cy + G) % G) * G + ((cx + G) % G);
          const qx = cx + jx[k] - px, qy = cy + jy[k] - py, d = qx * qx + qy * qy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = k;
          } else if (d < d2) d2 = d;
        }
      const nn = n[i] - 0.5, e = ((Math.sqrt(d2) - Math.sqrt(d1)) * S) / G + nn * 8, bev = sstep(2, 11, e);
      const l = (0.68 + tone[id] * 0.26 + nn * 0.5) * (0.3 + 0.7 * bev), m = (1 - bev) * 0.6;
      o[0] = l * (1 - m * 0.3);
      o[1] = l * (1 - m * 0.05);
      o[2] = l * (0.94 - m * 0.4);
      return 0.15 + 0.85 * bev * (0.85 + nn * 0.4);
    });
  };
  const barkTex = () => {
    const S = 256, n = fbm(S, S, 16, 2, 4), f = fbm(S, S, 8, 8, 3);
    return withH(S, S, (i, _x, _y, o) => {
      const cr = sstep(0.42, 0.33, n[i]), l = (0.66 + (n[i] - 0.5) * 1.2 + (f[i] - 0.5) * 0.3) * (1 - cr * 0.55);
      o[0] = l;
      o[1] = l * 0.94;
      o[2] = l * 0.86;
      return n[i] - cr * 0.3;
    });
  };
  const textured: { m: THREE.MeshLambertMaterial; map: THREE.Texture; bumpMap: THREE.Texture }[] = [];
  const setMaps = (m: THREE.MeshLambertMaterial, [c, h]: Pair, rep: [number, number], bs: number) => {
    const map = tex(c, rep);
    const bumpMap = tex(h, rep, false);
    m.map = map;
    m.bumpMap = bumpMap;
    m.bumpScale = bs;
    textured.push({ m, map, bumpMap });
  };
  const plain = stonePlain();
  setMaps(M.piedra, stoneBlocks(), [1 / 1.8, 1 / 1.8], 3);
  setMaps(M.piedra2, plain, [1 / 1.2, 1 / 1.2], 2);
  setMaps(M.columna, plain, [1, 2], 2);
  setMaps(M.suelo, groundTex(), [16, 16], 2);
  setMaps(M.camino, flagstones(), [1 / 1.7, 1 / 1.7], 3);
  setMaps(M.madera, barkTex(), [2, 3], 2);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, name = "") => {
    const o = new THREE.Mesh(projUV(new THREE.BoxGeometry(w, h, d)), m);
    o.position.set(x, y, z);
    o.name = name;
    return o;
  };
  const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 10) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    o.position.set(x, y, z);
    return o;
  };
  const prism = (w: number, h: number, d: number, m: THREE.Material) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return new THREE.Mesh(projUV(g), m);
  };
  const tmp = new THREE.Object3D();
  const instanced = (geo: THREE.BufferGeometry, m: THREE.Material, list: Inst[], name: string) => {
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((p, i) => {
      tmp.position.set(...p.pos);
      tmp.rotation.set(...(p.rot || [0, 0, 0]));
      tmp.scale.set(...(p.scale || [1, 1, 1]));
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
    });
    im.name = name;
    return im;
  };
  let seed = 7;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const makeTree = (x: number, z: number, s: number, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = rnd() * 6.28;
    g.add(cyl(0.08, 0.2, 3.4, M.madera, 0, 1.7, 0, 7));
    (
      [
        [0.5, 2.6, 0.9, -0.8],
        [-0.4, 2.9, 0.8, 0.7],
        [0.3, 3.3, 0.7, -0.4],
        [-0.25, 2.2, 0.7, 1.0],
        [0.7, 3.4, 0.6, -1.1],
      ] as const
    ).forEach(([bx, by, l, rz], i) => {
      const r = cyl(0.015, 0.05, l, M.madera, bx * 0.5, by, 0, 5);
      r.rotation.z = rz;
      r.name = "rama_" + i;
      g.add(r);
    });
    return g;
  };

  // ---------- Layout (la persona está afuera, en el camino, frente a la reja) ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), M.suelo);
  ground.rotation.x = -Math.PI / 2;
  ground.name = "suelo";
  scene.add(ground);
  scene.add(box(1.7, 0.04, 30, M.camino, 0, 0.02, 4, "camino"));

  const reja = new THREE.Group();
  reja.name = "reja";
  [-1.55, 1.55].forEach((x, i) => {
    reja.add(box(0.7, 3.6, 0.7, M.piedra, x, 1.8, 0, "pilar_" + i));
    reja.add(box(0.86, 0.2, 0.86, M.piedra2, x, 3.7, 0, "remate_" + i));
  });
  const hojas = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.name = "hoja_" + (side < 0 ? "izq" : "der");
    pivot.position.set(side * 1.2, 0, 0);
    const bars: Inst[] = [];
    for (let k = 0; k < 8; k++) bars.push({ pos: [-side * (0.08 + k * 0.15), 1.5, 0] });
    pivot.add(instanced(new THREE.CylinderGeometry(0.025, 0.025, 2.9, 6), M.hierro, bars, "barrotes"));
    [0.25, 1.45, 2.8].forEach((y, k) => pivot.add(box(1.2, 0.07, 0.07, M.hierro, -side * 0.6, y, 0, "travesano_" + k)));
    reja.add(pivot);
    return pivot;
  });
  const cadenas = new THREE.Group();
  cadenas.name = "cadenas";
  const c1 = box(2.6, 0.06, 0.06, M.hierro, 0, 1.55, 0.09, "cadena_a");
  c1.rotation.z = 0.42;
  const c2 = box(2.6, 0.06, 0.06, M.hierro, 0, 1.55, 0.11, "cadena_b");
  c2.rotation.z = -0.42;
  const candado = box(0.26, 0.3, 0.1, M.madera, 0, 1.5, 0.16, "candado");
  cadenas.add(c1, c2, candado);
  reja.add(cadenas);
  scene.add(reja);

  // Muro + reja lateral, se pierden en la niebla
  const fenceBars: Inst[] = [];
  [-1, 1].forEach((side) => {
    scene.add(box(10.2, 0.9, 0.5, M.piedra, side * 7.0, 0.45, 0, "muro_" + (side < 0 ? "izq" : "der")));
    scene.add(box(10.2, 0.06, 0.06, M.hierro, side * 7.0, 2.3, 0, "riel_" + side));
    for (let x = 2.05; x <= 12; x += 0.2) fenceBars.push({ pos: [side * x, 1.62, 0] });
    [7.6, 12].forEach((px) => scene.add(box(0.5, 1.2, 0.6, M.piedra2, side * px, 0.6, 0, "poste")));
  });
  scene.add(instanced(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 5), M.hierro, fenceBars, "barrotes_cerca"));

  const mausoleo = new THREE.Group();
  mausoleo.name = "mausoleo";
  mausoleo.position.set(-5, 0, -2.8);
  mausoleo.add(box(2.4, 0.25, 2.4, M.piedra2, 0, 0.125, 0, "zocalo"));
  mausoleo.add(box(2.1, 2.3, 2.1, M.piedra, 0, 1.4, 0, "cuerpo"));
  const techo = prism(2.5, 0.9, 2.4, M.piedra2);
  techo.position.y = 2.55;
  techo.name = "techo";
  mausoleo.add(techo);
  mausoleo.add(box(0.8, 1.5, 0.04, M.hueco, 0, 1.0, 1.07, "puerta"));
  mausoleo.add(box(0.08, 0.6, 0.08, M.piedra2, 0, 3.7, 0, "cruz_v"), box(0.36, 0.08, 0.08, M.piedra2, 0, 3.8, 0, "cruz_h"));
  scene.add(mausoleo);

  const cripta = new THREE.Group();
  cripta.name = "cripta";
  cripta.position.set(5, 0, -3);
  cripta.add(box(3.2, 0.3, 2.6, M.piedra2, 0, 0.15, 0, "zocalo"));
  cripta.add(box(2.6, 2.2, 1.5, M.piedra, 0, 1.4, -0.45, "cuerpo"));
  [-1.2, -0.45, 0.45, 1.2].forEach((x, i) => {
    const c = cyl(0.13, 0.15, 2.2, M.columna, x, 1.4, 0.95, 12);
    c.name = "columna_" + i;
    cripta.add(c);
  });
  cripta.add(box(3.2, 0.3, 2.6, M.piedra2, 0, 2.65, 0, "entablamento"));
  const fronton = prism(3.2, 0.7, 2.6, M.piedra);
  fronton.position.y = 2.8;
  fronton.name = "fronton";
  cripta.add(fronton);
  cripta.add(box(0.8, 1.6, 0.04, M.hueco, 0, 1.1, 0.31, "puerta"));
  scene.add(cripta);

  const farol = new THREE.Group();
  farol.name = "farol";
  farol.position.set(1.55, 3.1, 0.36);
  farol.add(box(0.06, 0.06, 0.32, M.hierro, 0, 0.3, 0.16, "brazo"));
  farol.add(box(0.26, 0.4, 0.26, M.hierro, 0, 0, 0.34, "cuerpo"));
  farol.add(box(0.18, 0.28, 0.27, M.luz, 0, 0, 0.34, "llama"));
  scene.add(farol);

  const arboles = [makeTree(-1.05, 0.9, 1, "arbol_reja")];
  (
    [
      [-4.2, 3.6, 1.15],
      [4.8, 2.8, 0.95],
      [-6.8, 7.5, 1.3],
      [7.6, 6.8, 1.2],
      [-3.2, 11, 1.1],
      [3.6, 12.5, 1.25],
    ] as const
  ).forEach(([x, z, s], i) => arboles.push(makeTree(x, z, s, "arbol_" + i)));
  arboles.forEach((t) => scene.add(t));

  const graves: Inst[] = [];
  while (graves.length < 22) {
    const x = (rnd() * 2 - 1) * 9, z = -1.1 - rnd() * 7.5;
    if (Math.abs(x) < 1.3) continue;
    if (Math.abs(x + 5) < 1.7 && z > -4.6) continue;
    if (Math.abs(x - 5) < 2.0 && z > -4.8) continue;
    const h = 0.6 + rnd() * 0.5;
    graves.push({ pos: [x, h / 2, z], rot: [(rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.15], scale: [1, h, 1] });
  }
  scene.add(instanced(projUV(new THREE.BoxGeometry(0.55, 1, 0.14)), M.piedra2, graves, "lapidas"));

  const ojos = new THREE.Group();
  ojos.name = "ojos";
  ojos.position.set(-3.4, 1.35, -0.7);
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
  [-0.07, 0.07].forEach((x, i) => {
    const e = new THREE.Mesh(eyeGeo, M.ojos);
    e.position.x = x;
    e.name = "ojo_" + i;
    ojos.add(e);
  });
  scene.add(ojos);
  (
    [
      [3.7, 1.25, -0.8],
      [5, 1.5, -1.65],
    ] as const
  ).forEach(([x, y, z], k) =>
    [-0.07, 0.07].forEach((dx) => {
      const e = new THREE.Mesh(eyeGeo, M.ojos);
      e.position.set(x + dx, y, z);
      e.name = "ojos_deco_" + k;
      scene.add(e);
    }),
  );

  const luna = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), M.luna);
  luna.position.set(-1.5, 14.5, -28); // el diseño la traía en (5, 12): quedaba pegada al farol y se activaban los dos a la vez (founder)
  luna.name = "luna";
  scene.add(luna);

  // ---------- Decoración: cielo, nubes, niebla, hierba, telarañas, farol ----------
  const plane1 = new THREE.PlaneGeometry(1, 1);
  const moonDir = new THREE.Vector3(0, 0.3, -1).normalize();
  const radialTex = (inner: number, pw = 1) =>
    tex(
      paint(128, 128, (_i, x, y, o) => {
        o[0] = o[1] = o[2] = Math.pow(1 - sstep(inner, 1, Math.hypot(x - 63.5, y - 63.5) / 64), pw);
      }),
      [1, 1],
      false,
      true,
    );

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      cTop: { value: new THREE.Color(0x07080b) },
      cHor: { value: new THREE.Color(BG) },
      cGlow: { value: new THREE.Color(0x4a5266) },
      moonDir: { value: moonDir },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 cTop, cHor, cGlow, moonDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(cHor, cTop, pow(h, 0.55));
        float g = max(dot(d, moonDir), 0.0); c += cGlow * (pow(g, 60.0) * 0.9 + pow(g, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
  sky.name = "cielo";
  sky.renderOrder = -1;
  scene.add(sky);

  const cloudTex = () => {
    const W = 512, H = 256, n = fbm(W, H, 6, 3, 6);
    return tex(
      paint(W, H, (i, x, y, o) => {
        const u = (x / W) * 2 - 1, v = (y / H) * 2 - 1, e = 1 - (u * u * 1.15 + v * v * 1.7), d = n[i] - 0.5 + e * 0.5 - 0.16;
        o[0] = o[1] = o[2] = 0.62 + 0.38 * (1 - y / H) + (n[i] - 0.5) * 0.5;
        o[3] = sstep(0, 0.2, d) * 0.92;
      }),
      [1, 1],
      true,
      true,
    );
  };
  const nubes = new THREE.Group();
  nubes.name = "nubes";
  const cloudMaps = [cloudTex(), cloudTex(), cloudTex()];
  const clouds = Array.from({ length: 9 }, (_, i) => {
    const w = 16 + R() * 16, far = i % 3 === 2;
    const m = new THREE.Mesh(
      plane1,
      new THREE.MeshBasicMaterial({ map: cloudMaps[i % 3], color: far ? 0x434957 : 0x5b6273, transparent: true, depthWrite: false, fog: false, opacity: 0 }),
    );
    m.scale.set(w, w * 0.4, 1);
    m.position.set(i === 0 ? -4 : -55 + i * 12 + R() * 6, i === 0 ? 11 : 9 + R() * 10, far ? -50 - R() * 8 : -24 - R() * 3);
    m.userData = { v: 0.2 + R() * 0.3, op: 0.6 + R() * 0.3 };
    m.name = "nube";
    nubes.add(m);
    return m;
  });
  scene.add(nubes);

  const niebla = new THREE.Group();
  niebla.name = "niebla";
  const fogTile = (() => {
    const S = 256, n = fbm(S, S, 4, 4, 5);
    return tex(
      paint(S, S, (i, _x, _y, o) => {
        o[0] = o[1] = o[2] = 1;
        o[3] = sstep(0.36, 0.7, n[i]);
      }),
      [1, 1],
      false,
    );
  })();
  const fogMask = radialTex(0.4);
  const fogLayers = (
    [
      [0.12, 7, 0.42, 0.012, 0.004],
      [0.42, 4.5, 0.2, -0.009, 0.006],
      [0.9, 3, 0.09, 0.006, -0.003],
    ] as const
  ).map(([y, rep, op, vx, vz]) => {
    const map = fogTile.clone();
    map.repeat.set(rep, rep * 0.7);
    map.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 50),
      new THREE.MeshBasicMaterial({ map, alphaMap: fogMask, color: 0x98a0b2, transparent: true, opacity: op, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, 1);
    m.name = "niebla_suelo";
    m.userData.vel = [vx, vz];
    niebla.add(m);
    return { m, map };
  });
  const blobTex = (() => {
    const S = 128, n = fbm(S, S, 4, 4, 4);
    return tex(
      paint(S, S, (i, x, y, o) => {
        const r = Math.hypot(x - 63.5, y - 63.5) / 64;
        o[0] = o[1] = o[2] = 1;
        o[3] = Math.pow(1 - sstep(0.05, 1, r), 1.5) * sstep(0.3, 0.7, n[i]);
      }),
      [1, 1],
      false,
      true,
    );
  })();
  const wisps = Array.from({ length: mobile ? 9 : 16 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: blobTex, color: 0xa4acbd, transparent: true, depthWrite: false, opacity: 0 }));
    const w = 3 + R() * 4;
    s.scale.set(w, w * 0.35, 1);
    s.position.set((R() * 2 - 1) * 12, 0.4 + R() * 0.7, -8.5 + R() * 11);
    s.userData = { v: 0.08 + R() * 0.16, op: 0.14 + R() * 0.14 };
    s.name = "niebla_jiron";
    niebla.add(s);
    return s;
  });
  // Banco de niebla al fondo: tapa el horizonte (sin muro trasero)
  const bankTex = (() => {
    const W = 512, H = 128, n = fbm(W, H, 8, 2, 5);
    return tex(
      paint(W, H, (i, x, y, o) => {
        const u = (x / W) * 2 - 1;
        o[0] = o[1] = o[2] = 1;
        o[3] = (1 - sstep(0.55, 1, Math.abs(u))) * sstep(0.05, 0.7, y / H + (n[i] - 0.5) * 0.6);
      }),
      [1, 1],
      false,
      true,
    );
  })();
  const banks = (
    [
      [-9, 0.5, 2.6],
      [-10.5, 0.65, 3.4],
      [-12.5, 0.8, 4.4],
      [-15, 0.95, 6],
    ] as const
  ).map(([z, op, h], i) => {
    const m = new THREE.Mesh(plane1, new THREE.MeshBasicMaterial({ map: bankTex, color: 0x98a0b2, transparent: true, opacity: op, depthWrite: false }));
    m.scale.set(36 + i * 8, h, 1);
    m.position.set(0, h / 2 - 0.3, z);
    m.userData.ph = i * 1.7;
    m.name = "niebla_banco";
    niebla.add(m);
    return m;
  });
  scene.add(niebla);

  // Hierba: matas instanciadas de 6 hojas, viento en vertex shader
  const grassU = { value: 0 };
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, name: "hierba" });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassU;
    sh.vertexShader =
      "uniform float uTime;\n" +
      sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      float hk = clamp(position.y / 0.45, 0.0, 1.0); hk *= hk;
      vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      float wv = sin(uTime * 1.3 + ip.x * 0.45 + ip.y * 0.3) * 0.7 + sin(uTime * 2.9 + ip.x * 1.7 - ip.y) * 0.3;
      transformed.xz += vec2(0.07, 0.03) * wv * hk;`,
      );
    sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize(vNormal);");
  };
  const tuftGeo = () => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c0 = new THREE.Color(0x1b2119), c1 = new THREE.Color(0x66704f), c = new THREE.Color();
    for (let b = 0; b < 6; b++) {
      const a = (b / 6) * 6.283 + R() * 0.9, h = 0.2 + R() * 0.24, w = 0.022 + R() * 0.014, lean = 0.06 + R() * 0.12;
      const dx = Math.cos(a), dz = Math.sin(a), v0 = pos.length / 3;
      (
        [
          [0, 1],
          [0.55, 0.65],
          [1, 0],
        ] as const
      ).forEach(([t, k]) => {
        const cx = dx * (0.025 + lean * t * t), cz = dz * (0.025 + lean * t * t), y = h * t, hw = (w * k) / 2;
        c.copy(c0).lerp(c1, t);
        if (k) {
          pos.push(cx + dz * hw, y, cz - dx * hw, cx - dz * hw, y, cz + dx * hw);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        } else {
          pos.push(cx, y, cz);
          col.push(c.r, c.g, c.b);
        }
      });
      idx.push(v0, v0 + 1, v0 + 3, v0, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    return g;
  };
  const blocked = (x: number, z: number) =>
    Math.abs(x) < 0.95 ||
    (Math.abs(z) < 0.3 && Math.abs(x) < 12.2) ||
    (Math.abs(Math.abs(x) - 1.55) < 0.42 && Math.abs(z) < 0.42) ||
    (Math.abs(x + 5) < 1.3 && Math.abs(z + 2.8) < 1.3) ||
    (Math.abs(x - 5) < 1.7 && Math.abs(z + 3) < 1.4) ||
    z < -9.15;
  const tufts: Inst[] = [];
  const NT = mobile ? 2800 : 6000;
  while (tufts.length < NT) {
    const r = rnd();
    let x: number, z: number, k = 1;
    if (r < 0.2) { x = (rnd() * 2 - 1) * 12.2; z = (rnd() < 0.6 ? 1 : -1) * (0.3 + rnd() * 0.5); k = 1.25; } // pie del muro
    else if (r < 0.32) { x = (rnd() < 0.5 ? -1 : 1) * (0.95 + rnd() * 0.55); z = -9 + rnd() * 22; k = 1.15; } // bordes del camino
    else if (r < 0.75) { x = (rnd() * 2 - 1) * 16; z = 0.3 + Math.pow(rnd(), 1.4) * 16; } // afuera
    else { x = (rnd() * 2 - 1) * 11; z = -0.3 - rnd() * 8.9; } // adentro
    if (blocked(x, z)) continue;
    const s = (0.65 + rnd() * 0.6) * k;
    tufts.push({ pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scale: [s, s * (0.75 + rnd() * 0.6), s] });
  }
  const hierba = instanced(tuftGeo(), grassMat, tufts, "hierba");
  const ic = new THREE.Color();
  tufts.forEach((_, i) => {
    const d = rnd();
    ic.setRGB(0.8 + d * 0.35, 0.8 + d * 0.2, 0.7 + rnd() * 0.15);
    hierba.setColorAt(i, ic);
  });
  scene.add(hierba);

  // Telarañas: textura dibujada en canvas sobre planos en esquinas
  function webC(corner: boolean) {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    texBytes += S * S * 5.33;
    texCount++;
    const g = c.getContext("2d")!;
    g.strokeStyle = "#fff";
    g.lineCap = "round";
    const cx = corner ? 3 : S / 2, cy = cx, N = corner ? 8 : 14, span = corner ? Math.PI / 2 : Math.PI * 2, a0 = corner ? 0 : R() * 6.28;
    const rays = Array.from({ length: N }, (_, i) => {
      const edge = corner && (i === 0 || i === N - 1);
      const a = a0 + span * (corner ? i / (N - 1) : i / N) + (edge ? 0 : ((R() - 0.5) * span) / N * 0.6);
      return [Math.cos(a), Math.sin(a), (corner ? S * 0.97 : S * 0.47) * (edge ? 1 : 0.8 + R() * 0.2)];
    });
    g.lineWidth = 2.6;
    g.globalAlpha = 0.9;
    rays.forEach(([dx, dy, L]) => {
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + dx * L, cy + dy * L);
      g.stroke();
    });
    const Lmax = corner ? S * 0.95 : S * 0.46, segs = corner ? N - 1 : N;
    g.lineWidth = 1.8;
    g.globalAlpha = 0.75;
    for (let r = Lmax * 0.08, st = Lmax * 0.04; r < Lmax * 0.93; r += st, st *= 1.05)
      for (let i = 0; i < segs; i++) {
        if (R() < 0.07) continue;
        const A = rays[i], B = rays[(i + 1) % N], ra = Math.min(r, A[2] * 0.97), rb = Math.min(r, B[2] * 0.97);
        const ax = cx + A[0] * ra, ay = cy + A[1] * ra, bx = cx + B[0] * rb, by = cy + B[1] * rb;
        g.beginPath();
        g.moveTo(ax, ay);
        g.quadraticCurveTo(cx + ((ax + bx) / 2 - cx) * 0.9, cy + ((ay + by) / 2 - cy) * 0.9, bx, by);
        g.stroke();
      }
    return c;
  }
  const webMat = (corner: boolean) =>
    new THREE.MeshBasicMaterial({ map: tex(webC(corner), [1, 1], true, true), color: 0xc8cdd8, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, name: "telarana" });
  const WC = webMat(true), WF = webMat(false);
  const telas = new THREE.Group();
  telas.name = "telaranas";
  const ROT: Record<Corner, number> = { tl: 0, bl: Math.PI / 2, br: Math.PI, tr: -Math.PI / 2 };
  const OFF: Record<Corner, [number, number]> = { tl: [1, -1], bl: [1, 1], br: [-1, 1], tr: [-1, -1] };
  const web = (corner: Corner | null, s: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(plane1, corner ? WC : WF);
    m.scale.setScalar(s);
    m.name = "telarana";
    if (corner) {
      m.rotation.z = ROT[corner];
      m.position.set(x + (OFF[corner][0] * s) / 2, y + (OFF[corner][1] * s) / 2, z);
    } else {
      m.position.set(x, y, z);
      m.rotation.z = R() * 6.28;
    }
    telas.add(m);
    return m;
  };
  web("br", 0.85, -1.9, 2.33, 0.04); // pilar izq + riel
  web("bl", 0.6, 1.9, 2.33, 0.04); // pilar der + riel
  web("tl", 0.42, -5.4, 1.75, -1.68); // puerta del mausoleo
  web("tl", 0.46, 3.94, 2.5, -2.05); // columnas de la cripta
  web("tr", 0.4, 6.06, 2.5, -2.05);
  scene.updateMatrixWorld(true);
  (
    [
      [0, 0.3, 2.75, 0.7],
      [1, 0.25, 2.6, 0.85],
    ] as const
  ).forEach(([t, x, y, s]) => {
    const p = arboles[t].localToWorld(new THREE.Vector3(x, y, 0));
    web(null, s, p.x, p.y, p.z);
  });
  scene.add(telas);

  // Farol: luz cálida con parpadeo + halo
  const farolLuz = new THREE.PointLight(0xffb36a, 7, 9, 2);
  farolLuz.position.set(1.55, 3.0, 0.85);
  farolLuz.name = "farol_luz";
  scene.add(farolLuz);
  const haloMat = new THREE.SpriteMaterial({ map: radialTex(0, 2.2), color: 0xffbf73, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(1.55, 3.1, 0.72);
  halo.scale.setScalar(1.4);
  halo.name = "farol_halo";
  scene.add(halo);
  const genMs = Math.round(performance.now() - t0);

  const capas: Record<Capa, (on: boolean) => void> = {
    tex: (on) =>
      textured.forEach(({ m, map, bumpMap }) => {
        m.map = on ? map : null;
        m.bumpMap = on ? bumpMap : null;
        m.needsUpdate = true;
      }),
    niebla: (on) => { niebla.visible = on; },
    hierba: (on) => { hierba.visible = on; },
    telas: (on) => { telas.visible = on; },
    nubes: (on) => { nubes.visible = on; },
  };

  // ---------- Oscuridad: el farol es casi la única luz (testing: botón "Oscuridad" o ?oscuro=0) ----------
  const LOOK = {
    claro: { bg: BG, near: 9, far: 34, hemi: [0xb9c2d6, 0x24242a, 1.5], sun: 1.4, top: 0x07080b, glow: 0x4a5266, luna: 0xd6d6d6, nube: [0x5b6273, 0x434957], niebla: 0x98a0b2, jiron: 0xa4acbd, tela: 0xc8cdd8, farol: [7, 9, 2], halo: [0.5, 1.4], linterna: 10 },
    oscuro: { bg: 0x08090c, near: 2.5, far: 19, hemi: [0x3a4356, 0x08080a, 0.12], sun: 0.06, top: 0x020203, glow: 0x11141c, luna: 0x6a6e76, nube: [0x1c2027, 0x15171c], niebla: 0x3c4250, jiron: 0x424a5a, tela: 0x7a808c, farol: [6, 7.5, 2], halo: [0.8, 1.9], linterna: 28 },
  };
  let farolBase = 7, haloBase = 0.5, haloScale = 1.4, linternaBase = 0, fogFar = 34;
  const fl = { end: 0, next: 2, lo: 0.2, k: 1 };
  const luzC = new THREE.Color(0xffe2b0);
  function setDark(on: boolean) {
    const L = on ? LOOK.oscuro : LOOK.claro, U = skyMat.uniforms;
    fog.color.setHex(L.bg);
    fog.near = L.near;
    fog.far = fogFar = L.far;
    renderer.setClearColor(L.bg);
    U.cHor.value.setHex(L.bg);
    U.cTop.value.setHex(L.top);
    U.cGlow.value.setHex(L.glow);
    hemi.color.setHex(L.hemi[0]);
    hemi.groundColor.setHex(L.hemi[1]);
    hemi.intensity = L.hemi[2];
    sun.intensity = L.sun;
    M.luna.color.setHex(L.luna);
    clouds.forEach((m, i) => m.material.color.setHex(L.nube[i % 3 === 2 ? 1 : 0]));
    fogLayers.forEach(({ m }) => m.material.color.setHex(L.niebla));
    banks.forEach((m) => m.material.color.setHex(L.niebla));
    wisps.forEach((s) => s.material.color.setHex(L.jiron));
    WC.color.setHex(L.tela);
    WF.color.setHex(L.tela);
    farolBase = L.farol[0];
    farolLuz.distance = L.farol[1];
    farolLuz.decay = L.farol[2];
    haloBase = L.halo[0];
    halo.scale.setScalar((haloScale = L.halo[1]));
    linternaBase = L.linterna;
  }
  setDark(opts.dark);

  // ---------- Puntos interactivos ----------
  type Label = string | Record<Estado, string> | (() => string);
  // Guiños geek (founder, 2026-10-01; no están en el diseño): luna = E.T., farol = la hoguera de
  // Dark Souls, ojos = Pokémon. La niebla (Silent Hill) no es zona.
  let farolOn = false; // el farol arranca apagado; tocarlo lo enciende
  const hotDefs: Record<Zone, { obj: THREE.Object3D; label: Label; when: Estado | "any"; min?: number }> = {
    reja: { obj: reja, label: { teaser: "", revelado: "Entrar" }, when: "any" }, // teaser: sin etiqueta, la reja responde al tocarla
    luna: { obj: luna, label: "", when: "any" },
    farol: { obj: farol, label: () => (farolOn ? "" : "?"), when: "any", min: 0.6 },
    ojos: { obj: ojos, label: "Algo salvaje apareció", when: "any", min: 0.6 },
  };
  scene.updateMatrixWorld(true);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitboxes: THREE.Mesh[] = [];
  const HOT = {} as Record<Zone, { label: Label; when: Estado | "any"; edges: THREE.LineSegments; hb: THREE.Mesh; anchor: THREE.Vector3 }>;
  (Object.keys(hotDefs) as Zone[]).forEach((id) => {
    const z = hotDefs[id];
    const bb = new THREE.Box3().setFromObject(z.obj).expandByScalar(0.08);
    const m = z.min || 0;
    const size = bb.getSize(new THREE.Vector3()).max(new THREE.Vector3(m, m, m));
    const c = bb.getCenter(new THREE.Vector3());
    const hb = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), hitMat);
    hb.position.copy(c);
    hb.userData.zone = id;
    scene.add(hb);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(hb.geometry), new THREE.LineBasicMaterial({ color: 0xe0443a, fog: false }));
    edges.position.copy(c);
    edges.visible = false;
    scene.add(edges);
    HOT[id] = { label: z.label, when: z.when, edges, hb, anchor: new THREE.Vector3(c.x, bb.max.y + 0.12, c.z) };
    hitboxes.push(hb);
  });
  const eyes = { t: -1, spot: 0, moved: false };
  const activeHits = () =>
    hitboxes.filter((h) => {
      const id = h.userData.zone as Zone, w = HOT[id].when;
      if (id === "ojos" && eyes.t >= 0) return false;
      return w === "any" || w === estado;
    });

  // ---------- Cámara en primera persona ----------
  const EYE = 1.65, GATE_Y = 1.95, D2R = Math.PI / 180;
  const LIM = { yaw: 0.9, pitchDown: -0.3, pitchUp: 0.5, zFront: 1.6, zBack: 2.5 };
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  let zRest = 6, basePitch = 0, zRestT = 6, basePitchT = 0, framed = false;
  const look = { yaw: 0, pitch: 0, z: 0 }, lookT = { yaw: 0, pitch: 0, z: 0 }, par = { x: 0, y: 0 };
  let walk: { t: number; dur: number; from: typeof look; done?: boolean } | null = null;

  function freeRect() {
    const W = stage.clientWidth, H = stage.clientHeight, pad = 12;
    let t = 0, b = H;
    const top = opts.top.getBoundingClientRect(), hero = opts.hero.getBoundingClientRect();
    if (top.height) t = top.bottom + pad;
    if (hero.height) b = hero.top - pad;
    return { t, b, w: W, h: Math.max(b - t, 80) };
  }
  // Distancia a la reja y pitch base: la reja entra en el área libre (entre header y hero).
  function frame() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    const a = W / H, portrait = a < 1;
    cam.fov = portrait ? 68 : 55;
    cam.aspect = a;
    cam.updateProjectionMatrix();
    const fr = freeRect(), tv = Math.tan((cam.fov / 2) * D2R), th = tv * a;
    const Wg = portrait ? 3.4 : 4.6, Hg = 3.9;
    const dW = (Wg * W) / (2 * th * 0.92 * fr.w), dH = (Hg * H) / (2 * tv * 0.92 * fr.h);
    zRestT = THREE.MathUtils.clamp(Math.max(dW, dH), 4.5, 9);
    const dy = (fr.t + fr.b) / 2 - H / 2;
    basePitchT = Math.atan((GATE_Y - EYE) / zRestT) + Math.atan((dy / (H / 2)) * tv);
    if (!framed) {
      zRest = zRestT;
      basePitch = basePitchT;
      framed = true;
    }
    renderer.setSize(W, H, false);
  }
  const ro = new ResizeObserver(frame);
  [stage, opts.hero, opts.top].forEach((n) => ro.observe(n));
  frame();

  const clampLook = () => {
    lookT.yaw = THREE.MathUtils.clamp(lookT.yaw, -LIM.yaw, LIM.yaw);
    lookT.pitch = THREE.MathUtils.clamp(lookT.pitch, LIM.pitchDown, LIM.pitchUp);
    lookT.z = THREE.MathUtils.clamp(lookT.z, LIM.zFront - zRest, LIM.zBack);
  };

  // ---------- Entrada: caminar a través de la reja ----------
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let veilTimer: ReturnType<typeof setTimeout> | undefined;
  function walkIn() {
    if (walk) return;
    walk = { t: 0, dur: 2.2, from: { ...look } };
    setHover(null);
    opts.onEnter();
  }
  function onWalkDone() {
    veil.classList.add("on");
    veilTimer = setTimeout(() => {
      const href = opts.href();
      if (href && href[0] !== "#") {
        location.href = href;
        return;
      }
      // URL pendiente: vuelve a la vista inicial para poder repetir la prueba
      walk = null;
      Object.assign(look, { yaw: 0, pitch: 0, z: 0 });
      Object.assign(lookT, { yaw: 0, pitch: 0, z: 0 });
      veil.classList.remove("on");
    }, 650);
  }

  // ---------- Estado ----------
  let gateT = estado === "revelado" ? 1 : 0, gateTo = gateT, rattle = 0, rattleAmp = 1;
  const applyGate = () => {
    const r = rattle > 0 ? Math.sin((1 - rattle) * 30) * 0.055 * rattleAmp * rattle : 0; // sacudón: la cadena frena las hojas
    cadenas.visible = gateT < 0.05;
    hojas[0].rotation.y = gateT * 1.25 + r;
    hojas[1].rotation.y = -gateT * 1.25 - r;
    cadenas.position.z = -1.1 * Math.sin(r);
  };
  applyGate();

  // ---------- Input: arrastrar = mirar, pinch/rueda = acercarse ----------
  const el = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, tapStart: { x: number; y: number; t: number } | null = null, pointerDirty = false, hovered: Zone | null = null, showAll = false, nudge = 0;
  const toNdc = (x: number, y: number) => {
    const r = el.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  };
  // La caja de la reja es enorme (tapa la luna, la lápida…): cualquier otra zona en el rayo le gana.
  const firstZone = (hits: THREE.Intersection[]): Zone | null => {
    const h = hits.find((x) => x.object.userData.zone !== "reja") ?? hits[0];
    return h ? (h.object.userData.zone as Zone) : null;
  };
  const pick = (): Zone | null => {
    ray.setFromCamera(ndc, cam);
    return firstZone(ray.intersectObjects(activeHits(), false));
  };
  // Táctil: no hay hover, así que la etiqueta reacciona a lo que queda en un área central de la
  // pantalla (donde apunta la linterna) — founder, 2026-10-01. Los ojos, más chicos, ganan a la reja.
  let touchMode = mobile;
  const CENTER: [number, number][] = [[0, 0], ...Array.from({ length: 8 }, (_, i): [number, number] => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])];
  const pickCentral = (): Zone | null => {
    const hits = activeHits();
    let found: Zone | null = null;
    for (const [x, y] of CENTER) {
      ndc.set((x * 0.22) / Math.max(cam.aspect, 1), y * 0.22 * Math.min(cam.aspect, 1));
      ray.setFromCamera(ndc, cam);
      const z = firstZone(ray.intersectObjects(hits, false));
      if (!z) continue;
      found = z;
      if (found !== "reja") break; // lo chico gana a la reja
    }
    return found;
  };
  const radPerPx = () => (cam.fov * D2R) / stage.clientHeight;

  // ---------- Linterna: sigue al mouse (escritorio); en táctil, al centro de la pantalla ----------
  scene.add(cam);
  const linterna = new THREE.SpotLight(0xfff0d8, 0, 26, 0.24, 0.55, 1.5);
  linterna.name = "linterna";
  linterna.position.set(0.22, -0.28, 0.1);
  cam.add(linterna);
  scene.add(linterna.target);
  const aim = new THREE.Vector2(0, -0.15), aimT = aim.clone(), aimV = new THREE.Vector3();
  let linternaOn = true;
  let linT: number | null = opts.skipIntro ? 1 : null; // null = aún no la tomó
  // En táctil la linterna apunta al centro de la pantalla (founder, 2026-10-01; el diseño seguía al dedo).
  if (mobile) {
    aim.set(0, 0);
    aimT.set(0, 0);
  }
  const setAim = (x: number, y: number) => {
    const r = el.getBoundingClientRect();
    aimT.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  };
  // Tweaks de testing: tamaño (ángulo del cono) e intensidad (% sobre la base del modo)
  let linternaMul = 0.3;
  linterna.angle = 10 * D2R;

  // ---------- Intro: "Toma esto" entrega la linterna y desbloquea el audio (?intro=0 la salta) ----------
  const LIN_DELAY = 0.35; // la linterna "llega a la mano" y se enciende
  // Asset: linterna low-poly, girando como objeto recién encontrado
  const iR = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  iR.setPixelRatio(Math.min(devicePixelRatio, 2));
  itemEl.appendChild(iR.domElement);
  const iS = new THREE.Scene(), iC = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  iC.position.set(0, 0.35, 4.4);
  iC.lookAt(0, 0, 0);
  iS.add(new THREE.HemisphereLight(0xb9c2d6, 0x1a1a1e, 1.1));
  const iKey = new THREE.DirectionalLight(0xffe2b0, 2.4);
  iKey.position.set(2, 3, 3);
  iS.add(iKey);
  const iRim = new THREE.DirectionalLight(0x9aa6c4, 1.4);
  iRim.position.set(-3, 1, -2);
  iS.add(iRim);
  const IM = {
    cuerpo: new THREE.MeshPhongMaterial({ color: 0x6e2c25, shininess: 28, name: "linterna_cuerpo" }),
    metal: new THREE.MeshPhongMaterial({ color: 0x9a9aa0, shininess: 90, specular: 0x999999, name: "linterna_metal" }),
    goma: new THREE.MeshPhongMaterial({ color: 0x1e1e22, shininess: 8, name: "linterna_goma" }),
    lente: new THREE.MeshBasicMaterial({ color: 0xfff0d8, name: "linterna_lente" }),
  };
  const lamp = new THREE.Group(), lampPivot = new THREE.Group();
  lamp.name = "linterna_item";
  lampPivot.add(lamp);
  iS.add(lampPivot);
  const part = (g: THREE.BufferGeometry, m: THREE.Material, y: number, name: string) => {
    const o = new THREE.Mesh(g, m);
    o.position.y = y;
    o.name = name;
    lamp.add(o);
    return o;
  };
  part(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 32), IM.cuerpo, -0.1, "cuerpo");
  for (let i = 0; i < 4; i++) part(new THREE.CylinderGeometry(0.178, 0.178, 0.035, 32), IM.goma, -0.47 + i * 0.08, "grip_" + i);
  part(new THREE.CylinderGeometry(0.185, 0.175, 0.12, 32), IM.metal, -0.66, "tapa");
  part(new THREE.CylinderGeometry(0.3, 0.18, 0.32, 32), IM.metal, 0.56, "cabeza");
  part(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 32), IM.metal, 0.75, "bisel");
  part(new THREE.CircleGeometry(0.26, 32), IM.lente, 0.781, "lente").rotation.x = -Math.PI / 2;
  part(new THREE.BoxGeometry(0.08, 0.16, 0.06), IM.goma, 0.2, "interruptor").position.z = 0.17;
  lamp.rotation.z = -Math.PI / 2 + 0.28;
  let iRaf = 0, introTO: ReturnType<typeof setTimeout> | undefined;
  const iLoop = (t: number) => {
    iRaf = requestAnimationFrame(iLoop);
    const s = t / 1000;
    lampPivot.rotation.y = s * 0.9;
    lampPivot.position.y = Math.sin(s * 1.7) * 0.06;
    iR.render(iS, iC);
  };
  const iRO = new ResizeObserver(() => {
    const w = itemEl.clientWidth;
    if (w) iR.setSize(w, w, false);
  });
  iRO.observe(itemEl);
  const startItem = () => {
    cancelAnimationFrame(iRaf);
    iRaf = requestAnimationFrame(iLoop);
  };
  const linK = (t: number) => (t < 0 ? 0 : t < 0.05 ? 1 : t < 0.11 ? 0.12 : t < 0.19 ? 0.75 : t < 0.25 ? 0.2 : 1); // arranque con titileo
  // clic del interruptor sintetizado: respaldo mientras la grabación (click-0.m4a) no ha cargado
  function clickSfx(c: AudioContext) {
    const sr = c.sampleRate, t = c.currentTime + LIN_DELAY;
    const buf = c.createBuffer(1, Math.round(sr * 0.04), sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
    (
      [
        [0, 1700, 0.7],
        [0.06, 2900, 0.4],
      ] as const
    ).forEach(([o, f, g]) => {
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), gn = c.createGain();
      src.buffer = buf;
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = 1.4;
      gn.gain.value = g;
      src.connect(bp).connect(gn).connect(c.destination);
      src.start(t + o);
    });
  }
  // Tocar cualquier punto de la pantalla toma la linterna y desbloquea el audio
  function takeLinterna(e: MouseEvent | KeyboardEvent) {
    if (intro.classList.contains("out")) return;
    const c = opts.audio();
    if (c && c.state !== "closed") {
      (window as Window & { __audio?: { ctx: AudioContext | null } }).__audio = { ctx: c };
      c.resume()
        .then(() => {
          if (!opts.click(LIN_DELAY)) clickSfx(c);
        })
        .catch(() => {});
    }
    // el haz nace donde se tocó (en táctil apunta al centro)
    if (e.detail && !touchMode && "clientX" in e) {
      setAim(e.clientX, e.clientY);
      aim.copy(aimT);
    }
    linT = -LIN_DELAY;
    intro.classList.add("out");
    introTO = setTimeout(() => {
      intro.hidden = true;
      cancelAnimationFrame(iRaf);
    }, 650);
  }
  const onIntroKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      takeLinterna(e);
    }
  };
  intro.addEventListener("click", takeLinterna);
  intro.addEventListener("keydown", onIntroKey);
  let introRaf = 0;
  const showIntro = () => {
    clearTimeout(introTO);
    linT = null;
    hush();
    intro.hidden = false;
    startItem();
    introRaf = requestAnimationFrame(() => intro.classList.remove("out"));
    intro.focus({ preventScroll: true });
  };
  if (linT !== null) intro.hidden = true;
  else {
    intro.hidden = false;
    intro.classList.remove("out");
    startItem();
    intro.focus({ preventScroll: true });
  }

  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchMode = e.pointerType !== "mouse";
    if (e.pointerType === "mouse") setAim(e.clientX, e.clientY);
    else aimT.set(0, 0);
    if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      tapStart = null;
    }
    stage.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (e.isPrimary && e.pointerType === "mouse") setAim(e.clientX, e.clientY);
    if (e.pointerType === "mouse" && !pointers.size) {
      touchMode = false;
      toNdc(e.clientX, e.clientY);
      pointerDirty = true;
      par.x = -ndc.x * 0.05;
      par.y = ndc.y * 0.03;
      return;
    }
    const p = pointers.get(e.pointerId);
    if (!p || walk) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      const k = radPerPx();
      lookT.yaw += dx * k;
      lookT.pitch += dy * k;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      lookT.z -= (d - pinch0) * 0.012;
      pinch0 = d;
    }
    clampLook();
  });
  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) stage.classList.remove("dragging");
    if (tapStart && !pointers.size) {
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y), dt = performance.now() - tapStart.t;
      tapStart = null;
      if (moved < 6 && dt < 500 && !walk) {
        toNdc(e.clientX, e.clientY);
        const id = pick();
        if (e.pointerType === "mouse") setHover(id); // en táctil la etiqueta la decide el área central
        act(id);
      }
    }
  };
  el.addEventListener("pointerup", endPointer);
  el.addEventListener("pointercancel", endPointer);
  el.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") {
      setHover(null);
      par.x = par.y = 0;
    }
  });
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (walk) return;
      lookT.z += e.deltaY * 0.004;
      clampLook();
    },
    { passive: false },
  );

  const labelOf = (id: Zone) => {
    const l = HOT[id].label;
    return typeof l === "function" ? l() : typeof l === "object" ? l[estado] : l;
  };
  // La etiqueta solo se mueve mientras tiene texto: si no, al pasar a una zona sin etiqueta (la luna)
  // el texto anterior saltaba ahí mientras se desvanecía.
  let tagOn = false;
  function setHover(id: Zone | null) {
    if (hovered === id) return;
    hovered = id;
    const lb = id && labelOf(id);
    if (lb) tag.textContent = lb;
    tag.classList.toggle("show", !!lb);
    tagOn = !!lb;
    el.style.cursor = id ? "pointer" : "";
  }

  // ---------- Feedback al tocar: primero reacciona el objeto, después (solo la reja) un texto corto ----------
  const MSG_AT = new THREE.Vector3(0, 2.05, 0.3);
  let msgOn = false, flashing = false, sayTO: ReturnType<typeof setTimeout> | undefined, msgRaf = 0, tries = 0, lastTry = 0, lastAct = 0, shake = 0;
  const fechaAbre = () => {
    const a = opts.abre(), wd = new Intl.DateTimeFormat("es", { weekday: "long" }).format(a);
    return wd + " " + a.getDate() + " " + (a.getHours() + a.getMinutes() === 0 ? "a medianoche" : "a las " + new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" }).format(a));
  };
  const falta = () => {
    const s = (opts.abre().getTime() - Date.now()) / 1000;
    if (s <= 0) return "Aún no";
    const [n, u] = s >= 86400 ? [Math.floor(s / 86400), "día"] : s >= 3600 ? [Math.floor(s / 3600), "hora"] : s >= 60 ? [Math.floor(s / 60), "minuto"] : [Math.ceil(s), "segundo"];
    return n === 1 ? "Falta 1 " + u : "Faltan " + n + " " + u + "s";
  };
  // Sin punto final (founder, 2026-10-01; el diseño los traía). Escala con cada intento seguido; tras 8 s sin tocar vuelve a empezar
  const LINES = [() => "Está cerrada", () => "Aún no", falta, () => "Abre el " + fechaAbre(), () => "Insistir no la abre"];
  const line = (i: number) => LINES[i < LINES.length ? i : 1 + ((i - 1) % (LINES.length - 1))]();
  function hush() {
    clearTimeout(sayTO);
    cancelAnimationFrame(msgRaf);
    msgOn = false;
    msg.classList.remove("show");
    if (flashing) {
      flashing = false;
      opts.flash(null);
    }
  }
  function say(t: string) {
    hush();
    live.textContent = t;
    const mode = opts.msgMode();
    if (mode === "contador") {
      flashing = true;
      opts.flash(t);
    } else {
      msg.textContent = t;
      msgOn = true;
      if (mode === "subtitulo") msg.style.transform = `translate(${stage.clientWidth / 2}px, ${freeRect().b}px) translate(-50%, -100%)`;
      msgRaf = requestAnimationFrame(() => msg.classList.add("show"));
    }
    sayTO = setTimeout(hush, 2800);
  }
  // Ojos: parpadean, desaparecen y vuelven en otro lugar. Sin texto.
  const SPOTS: V3[] = [[-3.4, 1.35, -0.7], [-2.4, 0.95, -2.6], [2.5, 1.05, -1.7]];
  const dv = new THREE.Vector3();
  function blink() {
    if (eyes.t >= 0) return;
    eyes.t = 0;
    setHover(null);
  }
  function updEyes(dt: number) {
    if (eyes.t < 0) return;
    const t = (eyes.t += dt);
    let sy = 1;
    if (t < 0.24) sy = Math.abs(t - 0.12) / 0.12;
    else if (t < 0.36) sy = 1 - (t - 0.24) / 0.12;
    else if (t < 3.4) {
      sy = 0;
      if (!eyes.moved) {
        eyes.moved = true;
        const z = HOT.ojos;
        dv.set(...SPOTS[(eyes.spot = (eyes.spot + 1) % SPOTS.length)]).sub(ojos.position);
        [ojos.position, z.hb.position, z.edges.position, z.anchor].forEach((p) => p.add(dv));
      }
    } else if (t < 3.6) sy = (t - 3.4) / 0.2;
    else {
      eyes.t = -1;
      eyes.moved = false;
      pointerDirty = true;
    }
    ojos.scale.y = Math.max(0.001, sy);
    ojos.visible = sy > 0.01;
  }
  function act(id: Zone | null) {
    const now = performance.now();
    if (!id || now - lastAct < 280) return;
    lastAct = now;
    if (id === "reja") {
      if (estado === "revelado") {
        hush();
        return walkIn();
      }
      if (now - lastTry > 8000) tries = 0;
      lastTry = now;
      rattleAmp = Math.min(1.4, 0.7 + tries * 0.15);
      rattle = 1;
      nudge = 1;
      shake = 1;
      opts.onRattle();
      say(line(tries++));
    }
    if (id === "ojos" && eyes.t < 0) {
      blink();
      opts.onFx("scurry");
      say("Huyó");
    }
    if (id === "luna") cruzar();
    if (id === "farol") {
      hoguera = 1;
      opts.onFx("bonfire");
      if (!farolOn) {
        farolOn = true;
        setHover(null); // la "?" se va
        say("Hoguera encendida");
      }
    }
  }
  // Farol-hoguera: la llama sube un momento.
  let hoguera = 0;
  // Luna: una bici con pasajero en la canasta cruza por delante al alumbrarla (hover) o tocarla.
  const etC = document.createElement("canvas");
  etC.width = 256;
  etC.height = 192;
  {
    const g = etC.getContext("2d")!;
    g.strokeStyle = g.fillStyle = "#fff";
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = 6;
    const wheel = (x: number) => {
      g.beginPath();
      g.arc(x, 146, 34, 0, Math.PI * 2);
      g.stroke();
    };
    wheel(62);
    wheel(190);
    const path = (pts: number[][]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    path([[62, 146], [104, 96], [150, 146], [62, 146]]); // cuadro
    path([[104, 96], [172, 96], [150, 146]]);
    path([[172, 96], [190, 146]]); // horquilla
    path([[172, 96], [170, 70], [188, 66]]); // manubrio
    path([[104, 96], [98, 80]]); // poste del asiento
    g.lineWidth = 12;
    path([[100, 74], [122, 40], [168, 68]]); // torso y brazo del ciclista
    path([[104, 78], [134, 112], [150, 146]]); // pierna
    g.beginPath();
    g.arc(124, 26, 13, 0, Math.PI * 2); // cabeza (con capucha)
    g.fill();
    g.fillRect(176, 44, 44, 30); // canasta
    g.beginPath();
    g.ellipse(198, 30, 17, 12, 0, 0, Math.PI * 2); // el pasajero, envuelto en su manta
    g.fill();
    g.fillRect(186, 32, 24, 14);
  }
  const etMat = new THREE.MeshBasicMaterial({ alphaMap: tex(etC, [1, 1], false, true), color: 0x050507, transparent: true, depthWrite: false, fog: false, opacity: 0 });
  const et = new THREE.Mesh(plane1, etMat);
  et.name = "bici_luna";
  et.scale.set(1.5, 1.125, 1);
  et.visible = false;
  scene.add(et);
  let etT = -1, etRest = 0, etDwell = 0;
  function cruzar() {
    if (etT >= 0 || etRest > 0) return;
    etT = 0;
  }
  function updLuna(dt: number) {
    etRest = Math.max(0, etRest - dt);
    etDwell = hovered === "luna" ? etDwell + dt : 0;
    if (etDwell > 0.5) cruzar();
    if (etT < 0) return;
    etT += dt / 3.6;
    if (etT >= 1) {
      etT = -1;
      etRest = 5;
      et.visible = false;
      return;
    }
    et.visible = true;
    // cruza por delante de la luna, subiendo, con un vaivén leve
    et.position.set(luna.position.x - 2.7 + 5.4 * etT, luna.position.y - 0.75 + 1.3 * etT + Math.sin(etT * 14) * 0.04, luna.position.z + 2);
    et.rotation.z = 0.2;
    etMat.opacity = Math.min(1, etT * 8, (1 - etT) * 8);
  }
  // Niebla: quedarse mirando hacia la DERECHA 2,5 s (solo esa niebla — founder). La niebla se cierra, estática de radio.
  let nieblaT = 0, nieblaDone = false, mist = 0;
  function updNiebla(dt: number) {
    const away = !walk && linT !== null && look.yaw < -0.45; // yaw negativo = mirar a la derecha
    if (!away) {
      nieblaT = 0;
      if (look.yaw > -0.2) nieblaDone = false;
    } else if (!nieblaDone && (nieblaT += dt) > 2.5) {
      nieblaDone = true;
      mist = 1;
      opts.onFx("static");
      say("Hay algo en la niebla");
    }
    if (mist > 0 || fog.far !== fogFar) {
      mist = Math.max(0, mist - dt / 3);
      fog.far = fogFar * (1 - 0.45 * Math.sin(mist * Math.PI));
    }
  }

  // ---------- HUD ----------
  let sceneTris = 0;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).visible !== false) {
      const g = mesh.geometry;
      sceneTris += ((g.index ? g.index.count : g.getAttribute("position").count) / 3) * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1);
    }
  });
  let frames = 0, acc = 0, worst = 0;

  // ---------- Loop ----------
  const timer = new THREE.Timer(), v = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const sf = 1 - Math.exp(-dt * 4);
    zRest += (zRestT - zRest) * sf;
    basePitch += (basePitchT - basePitch) * sf;
    if (walk) {
      walk.t += dt;
      const k = ease(Math.min(1, walk.t / walk.dur)), f = walk.from;
      look.yaw = f.yaw * (1 - k);
      look.pitch = THREE.MathUtils.lerp(f.pitch, -basePitch, k);
      look.z = THREE.MathUtils.lerp(f.z, -4 - zRest, k);
      if (k >= 1 && !walk.done) {
        walk.done = true;
        onWalkDone();
      }
    } else {
      const s = 1 - Math.exp(-dt * 7);
      look.yaw += (lookT.yaw + par.x - look.yaw) * s;
      look.pitch += (lookT.pitch + par.y - look.pitch) * s;
      look.z += (lookT.z - look.z) * s;
    }
    cam.position.set(0, EYE, zRest + look.z);
    cam.rotation.set(basePitch + look.pitch, look.yaw, 0, "YXZ");
    const T = timer.getElapsed();
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 3.5);
      cam.position.x += Math.sin(T * 71) * 0.012 * shake;
      cam.position.y += Math.sin(T * 53) * 0.006 * shake;
    }
    if (walk) aimT.set(0, 0);
    aim.lerp(aimT, 1 - Math.exp(-dt * 10));
    cam.updateMatrixWorld();
    aimV.set(aim.x, aim.y, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(10).add(cam.position);
    linterna.target.position.copy(aimV);
    if (linT !== null) linT += dt;
    linterna.intensity = linternaOn && linT !== null ? linternaBase * linternaMul * linK(linT) : 0;
    sky.position.copy(cam.position);
    moonDir.copy(luna.position).sub(cam.position).normalize();
    grassU.value = T;
    fogLayers.forEach(({ m, map }) => {
      map.offset.x += m.userData.vel[0] * dt;
      map.offset.y += m.userData.vel[1] * dt;
    });
    wisps.forEach((s) => {
      const p = s.position;
      p.x += s.userData.v * dt;
      if (p.x > 13) p.x = -13;
      s.material.opacity = s.userData.op * (1 - sstep(9, 13, Math.abs(p.x)));
    });
    banks.forEach((m) => {
      m.position.x = Math.sin(T * 0.05 + m.userData.ph) * 2.5;
    });
    clouds.forEach((m) => {
      const p = m.position;
      p.x += m.userData.v * dt;
      if (p.x > 62) p.x = -62;
      m.material.opacity = m.userData.op * (1 - sstep(44, 62, Math.abs(p.x)));
    });
    // Parpadeo: vibración continua + apagones cortos al azar (a veces dobles)
    if (T > fl.end && T > fl.next) {
      fl.end = T + 0.04 + Math.random() * 0.14;
      fl.next = T + (Math.random() < 0.4 ? 0.08 + Math.random() * 0.15 : 1.2 + Math.random() * 4.5);
      fl.lo = 0.06 + Math.random() * 0.25;
    }
    const fk = T < fl.end ? fl.lo : 0.86 + 0.07 * Math.sin(T * 9.3) + 0.05 * Math.sin(T * 23.1 + 1.7) + 0.04 * Math.sin(T * 41.7);
    fl.k += (fk - fl.k) * (1 - Math.exp(-dt * 40));
    hoguera = Math.max(0, hoguera - dt / 1.4);
    const fOn = farolOn ? 1 : 0;
    farolLuz.intensity = farolBase * fl.k * (1 + 2.4 * hoguera) * fOn;
    haloMat.opacity = Math.min(1, haloBase * fl.k * (1 + hoguera)) * fOn;
    halo.scale.setScalar(haloScale * (1 + 0.6 * hoguera));
    M.luz.color.copy(luzC).multiplyScalar(farolOn ? 0.2 + 0.8 * fl.k : 0.012);

    if (gateT !== gateTo) gateT = gateTo > gateT ? Math.min(gateTo, gateT + dt / 1.6) : Math.max(gateTo, gateT - dt / 0.6);
    rattle = Math.max(0, rattle - dt * 1.8);
    applyGate();
    if (nudge > 0) {
      nudge = Math.max(0, nudge - dt * 2.5);
      candado.rotation.z = Math.sin(nudge * 22) * 0.25 * nudge;
    }
    if (touchMode) {
      pointerDirty = false;
      setHover(walk ? null : pickCentral());
    } else if (pointerDirty) {
      pointerDirty = false;
      setHover(pick());
    }
    updEyes(dt);
    updLuna(dt);
    updNiebla(dt);
    if (msgOn && opts.msgMode() === "objeto") {
      v.copy(MSG_AT).project(cam);
      msg.style.transform = `translate(${(v.x * 0.5 + 0.5) * stage.clientWidth}px, ${(-v.y * 0.5 + 0.5) * stage.clientHeight}px) translate(-50%, -100%)`;
    }
    if (hovered && tagOn) {
      v.copy(HOT[hovered].anchor).project(cam);
      // dentro de la pantalla aunque el ancla quede fuera (el árbol es más alto que el encuadre)
      const half = tag.offsetWidth / 2 + 8;
      const tx = Math.min(stage.clientWidth - half, Math.max(half, (v.x * 0.5 + 0.5) * stage.clientWidth));
      const ty = Math.min(stage.clientHeight - 20, Math.max(48, (-v.y * 0.5 + 0.5) * stage.clientHeight));
      tag.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -100%)`;
    }
    renderer.render(scene, cam);
    frames++;
    acc += dt;
    worst = Math.max(worst, dt);
    if (acc >= 0.5) {
      const i = renderer.info.render;
      hud.textContent = `fps      ${Math.round(frames / acc)}  (peor ${Math.round(worst * 1000)} ms)\ncámara   1ª persona · fov ${cam.fov}° · a ${cam.position.z.toFixed(1)} m de la reja\ndraw     ${i.calls}\ntris     ${i.triangles.toLocaleString("es")} / ${Math.round(sceneTris).toLocaleString("es")} escena\ndpr      ${renderer.getPixelRatio()}\naudio    ${opts.audio()?.state === "running" ? "running" : "bloqueado (falta tocar)"}\nassets   0 MB descarga · ${texCount} tex. canvas · gen ${genMs} ms · ~${(texBytes / 1048576).toFixed(1)} MB VRAM`;
      frames = 0;
      acc = 0;
      worst = 0;
    }
  });

  return {
    dispose() {
      disposed = true;
      hush();
      clearTimeout(veilTimer);
      clearTimeout(introTO);
      cancelAnimationFrame(iRaf);
      cancelAnimationFrame(introRaf);
      iRO.disconnect();
      intro.removeEventListener("click", takeLinterna);
      intro.removeEventListener("keydown", onIntroKey);
      iS.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      Object.values(IM).forEach((m) => m.dispose());
      iR.dispose();
      iR.domElement.remove();
      renderer.setAnimationLoop(null);
      ro.disconnect();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        mats.forEach((m) => {
          Object.values(m).forEach((val) => {
            if (val instanceof THREE.Texture) val.dispose();
          });
          m.dispose();
        });
      });
      textured.forEach(({ map, bumpMap }) => {
        map.dispose();
        bumpMap.dispose();
      });
      renderer.dispose();
      el.remove();
      stage.classList.remove("dragging");
      tag.classList.remove("show");
      veil.classList.remove("on");
    },
    setEstado(e) {
      estado = e;
      gateTo = e === "revelado" ? 1 : 0;
      setHover(null);
      hush();
    },
    walkIn,
    resetView() {
      lookT.yaw = lookT.pitch = lookT.z = 0;
    },
    setZonas(on) {
      showAll = on;
      (Object.keys(HOT) as Zone[]).forEach((id) => {
        HOT[id].edges.visible = showAll;
      });
    },
    setLinterna(on) {
      linternaOn = on;
    },
    setLinternaTam(deg) {
      linterna.angle = deg * D2R;
    },
    setLinternaInt(pct) {
      linternaMul = pct / 100;
    },
    setDark,
    setCapa(capa, on) {
      capas[capa](on);
    },
    hush,
    showIntro,
  };
}
