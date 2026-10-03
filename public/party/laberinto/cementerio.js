// Tema "cementerio": el mismo grid, pero los muros se vuelven parcelas de tumbas con reja, setos, cipreses
// y mausoleos; los pasillos son caminos de adoquín. Una barda alta con reja rodea todo, con la entrada cerrada
// detrás del jugador. Geometría fusionada por material y bloque de 8×8 celdas (pocas draw calls).
import * as THREE from '../vendor/three.module.min.js';
import { rng, fbm, texMuro, texPiedra, texAdoquin, texPasto, texSeto } from './texturas.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const hh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function construirCementerio({ scene, mapa, renderer, calidad = 'alta', semilla = 23 }) {
  const { W, H, C, at } = mapa, R = rng(semilla), baja = calidad === 'baja';
  const lib = [], keep = o => (lib.push(o), o);
  const grupo = new THREE.Group(); grupo.name = 'cementerio'; scene.add(grupo);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (c, srgb = true) => { const t = keep(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const esMuro = (x, y) => { const c = at(x, y); return c === '#' || c === 'M'; };
  const esBorde = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;

  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Telaraña dibujada en canvas: en esquina (corner) o completa, como en la entrada
  function telaTex(corner) {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.strokeStyle = '#fff'; g.lineCap = 'round';
    const cx = corner ? 2 : S / 2, cy = cx, N = corner ? 8 : 14, span = corner ? Math.PI / 2 : Math.PI * 2, a0 = corner ? 0 : R() * 6.28;
    const rays = Array.from({ length: N }, (_, i) => {
      const edge = corner && (i === 0 || i === N - 1), a = a0 + span * (corner ? i / (N - 1) : i / N) + (edge ? 0 : (R() - 0.5) * span / N * 0.6);
      return [Math.cos(a), Math.sin(a), (corner ? S * 0.97 : S * 0.47) * (edge ? 1 : 0.8 + R() * 0.2)];
    });
    g.lineWidth = 1.6; g.globalAlpha = 0.9; rays.forEach(([dx, dy, L]) => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * L, cy + dy * L); g.stroke(); });
    const Lmax = corner ? S * 0.95 : S * 0.46, segs = corner ? N - 1 : N; g.lineWidth = 1.1; g.globalAlpha = 0.75;
    for (let r = Lmax * 0.08, st = Lmax * 0.045; r < Lmax * 0.93; r += st, st *= 1.05) for (let i = 0; i < segs; i++) {
      if (R() < 0.07) continue;
      const A = rays[i], B = rays[(i + 1) % N], ra = Math.min(r, A[2] * 0.97), rb = Math.min(r, B[2] * 0.97);
      const ax = cx + A[0] * ra, ay = cy + A[1] * ra, bx = cx + B[0] * rb, by = cy + B[1] * rb;
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx + ((ax + bx) / 2 - cx) * 0.9, cy + ((ay + by) / 2 - cy) * 0.9, bx, by); g.stroke();
    }
    const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)); })();
  const objetivos = [], paredes = [], huecos = [], pivotes = {}, animados = {}, arbolesDentro = [], bancos = [];
  let binForzado = null, halosE = [], rattle = -1, rattleAmp = 1, intentos = 0, ultimo = -99;

  // ---------- Materiales ----------
  const [bloC, bloH] = texMuro(41), [adoC, adoH] = texAdoquin(), [pasC] = texPasto(), [setC, setH] = texSeto(), pieC = texPiedra(13);
  const MAT = {
    piedra: keep(new THREE.MeshLambertMaterial({ map: tex(pieC), vertexColors: true })),
    bloque: keep(new THREE.MeshLambertMaterial({ map: tex(bloC), bumpMap: tex(bloH, false), bumpScale: 2, vertexColors: true })),
    hierro: keep(new THREE.MeshLambertMaterial({ color: 0x232328, vertexColors: true })),
    techo:  keep(new THREE.MeshLambertMaterial({ color: 0x5a5e68, map: tex(pieC), vertexColors: true })),
    seto:   keep(new THREE.MeshLambertMaterial({ map: tex(setC), bumpMap: tex(setH, false), bumpScale: 3, vertexColors: true })),
    tronco: keep(new THREE.MeshLambertMaterial({ color: 0x2e2620, vertexColors: true })),
    camino: keep(new THREE.MeshLambertMaterial({ map: tex(adoC), bumpMap: tex(adoH, false), bumpScale: 1.8, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    farol:  keep(new THREE.MeshBasicMaterial({ color: 0xffd39a, vertexColors: true })),
    telaC:  keep(new THREE.MeshBasicMaterial({ map: telaTex(true), color: 0xc8cdd8, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })),
    telaF:  keep(new THREE.MeshBasicMaterial({ map: telaTex(false), color: 0xc8cdd8, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })),
  };
  const ESC = { piedra: 1.2, bloque: 0.5, hierro: 1, techo: 1, seto: 1, tronco: 1, camino: 0.5, farol: 1 };   // repeticiones por metro

  // ---------- Fusión ----------
  const prisma = (() => {
    const A = [-.5, 0], B = [.5, 0], T = [0, 1], p = [];
    const tri = (a, za, b, zb, c, zc) => p.push(a[0], a[1], za, b[0], b[1], zb, c[0], c[1], zc);
    tri(A, .5, B, .5, T, .5); tri(B, -.5, A, -.5, T, -.5);
    tri(A, .5, T, .5, T, -.5); tri(A, .5, T, -.5, A, -.5);
    tri(B, .5, B, -.5, T, -.5); tri(B, .5, T, -.5, T, .5);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return keep(g);
  })();
  const G = {
    caja: keep(new THREE.BoxGeometry(1, 1, 1)), plano: keep(new THREE.PlaneGeometry(1, 1)),
    cil: keep(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)), tronco: keep(new THREE.CylinderGeometry(0.32, 0.5, 1, 6)),
    punta: keep(new THREE.ConeGeometry(0.5, 1, 4)), cono: keep(new THREE.ConeGeometry(0.5, 1, 9)),
    disco: keep(new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, Math.PI / 2, Math.PI)),
    piram: keep(new THREE.ConeGeometry(0.71, 1, 4)), fuste: keep(new THREE.CylinderGeometry(0.5, 0.71, 1, 4)),
    anillo: keep(new THREE.TorusGeometry(0.04, 0.012, 5, 10)), prisma,
  };
  const plano = new Map(), bins = new Map();
  const sinIndice = g => { let r = plano.get(g); if (!r) { r = g.index ? keep(g.toNonIndexed()) : g; plano.set(g, r); } return r; };
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), CC = new THREE.Color();
  function ponerL(mat, geo, padre, x, y, z, o = {}) {
    const g = sinIndice(geo);
    if (o.q) Q.copy(o.q); else Q.setFromEuler(E.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    M4.compose(P3.set(x, y, z), Q, S3.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)); if (padre) M4.premultiply(padre);
    nm.getNormalMatrix(M4);
    const key = binForzado ? mat + '|@' + binForzado : mat + '|' + Math.floor(M4.elements[12] / C / 8) + ',' + Math.floor(M4.elements[14] / C / 8);
    let b = bins.get(key); if (!b) bins.set(key, b = { mat, grupo: binForzado, p: [], n: [], u: [], c: [] });
    CC.set(o.col ?? 0xffffff).multiplyScalar(o.k ?? 1);
    const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, e = ESC[mat] || 1;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(M4); nv.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      b.p.push(v.x, v.y, v.z); b.n.push(nv.x, nv.y, nv.z); b.c.push(CC.r, CC.g, CC.b);
      const ax = Math.abs(nv.x), ay = Math.abs(nv.y), az = Math.abs(nv.z);
      if (o.uvPropia) b.u.push(ua.getX(i), ua.getY(i)); else if (ay >= ax && ay >= az) b.u.push(v.x * e, v.z * e); else if (ax >= az) b.u.push(v.z * e, v.y * e); else b.u.push(v.x * e, v.y * e);
    }
  }
  const poner = (mat, geo, x, y, z, o) => ponerL(mat, geo, null, x, y, z, o);
  const marco = (x, z, ry, rx = 0, rz = 0, y = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const rotAlong = (ax, az) => Math.atan2(-az, ax);   // ry que alinea el eje x local con (ax, az)
  const ROTW = { tl: 0, bl: Math.PI / 2, br: Math.PI, tr: -Math.PI / 2 }, OFFW = { tl: [1, -1], bl: [1, 1], br: [-1, 1], tr: [-1, -1] };
  function telaB(B, corner, s, lx, ly, lz) {
    if (corner) ponerL('telaC', G.plano, B, lx + OFFW[corner][0] * s / 2, ly + OFFW[corner][1] * s / 2, lz, { rz: ROTW[corner], sx: s, sy: s, uvPropia: true });
    else ponerL('telaF', G.plano, B, lx, ly, lz, { rz: R() * 6.28, sx: s, sy: s, uvPropia: true });
  }
  const TONOS = [0xbab6ae, 0xa9ad9f, 0xb3aa9d, 0x9fa3a6];

  // ---------- Suelo: pasto y caminos de adoquín ----------
  const margen = 24, ancho = W * C + margen * 2, largo = H * C + margen * 2;
  const pasto = tex(pasC); pasto.repeat.set(ancho / 4, largo / 4);
  const suelo = new THREE.Mesh(keep(new THREE.PlaneGeometry(ancho, largo)), keep(new THREE.MeshLambertMaterial({ map: pasto, color: 0xb0b0a8 })));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(W * C / 2, 0, H * C / 2); suelo.name = 'pasto'; grupo.add(suelo);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y); if (c !== '.' && c !== 'S') continue;
    poner('camino', G.plano, (x + .5) * C, 0.004, (y + .5) * C, { rx: -Math.PI / 2, sx: C, sy: C, k: 0.9 + R() * 0.2 });
  }

  // ---------- Piezas ----------
  function lapidaDeco(B, lx, lz, k0 = 1) {
    const T = new THREE.Matrix4().compose(new THREE.Vector3(lx, 0, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - .5) * 0.16, (R() - .5) * 0.3, (R() - .5) * 0.18, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const Pv = B.clone().multiply(T), r = R(), col = TONOS[Math.floor(R() * TONOS.length)], k = (0.5 + R() * 0.32) * k0;
    if (r < 0.4) {
      const w = 0.44 + R() * 0.18, h = 0.48 + R() * 0.26, d = 0.1;
      ponerL('piedra', G.caja, Pv, 0, h / 2, 0, { sx: w, sy: h, sz: d, col, k });
      ponerL('piedra', G.disco, Pv, 0, h, 0, { rx: Math.PI / 2, sx: w, sy: d, sz: w, col, k });
    } else if (r < 0.58) {
      ponerL('piedra', G.caja, Pv, 0, 0.06, 0, { sx: 0.3, sy: 0.12, sz: 0.2, col, k: k * 0.9 });
      ponerL('piedra', G.caja, Pv, 0, 0.5, 0, { sx: 0.09, sy: 0.82, sz: 0.08, col, k });
      ponerL('piedra', G.caja, Pv, 0, 0.66, 0, { sx: 0.42, sy: 0.09, sz: 0.08, col, k });
    } else if (r < 0.72) {
      const hh2 = 1.0 + R() * 0.5;
      ponerL('piedra', G.caja, Pv, 0, 0.1, 0, { sx: 0.42, sy: 0.2, sz: 0.42, col, k: k * 0.9 });
      ponerL('piedra', G.fuste, Pv, 0, 0.2 + hh2 / 2, 0, { ry: Math.PI / 4, sx: 0.3, sy: hh2, sz: 0.3, col, k });
      ponerL('piedra', G.piram, Pv, 0, 0.2 + hh2 + 0.1, 0, { ry: Math.PI / 4, sx: 0.21, sy: 0.2, sz: 0.21, col, k });
    } else if (r < 0.88) {
      ponerL('piedra', G.caja, Pv, 0, 0.06, 0.3, { sx: 0.6, sy: 0.12, sz: 0.95, col, k: k * 0.85 });
      ponerL('piedra', G.caja, Pv, 0, 0.27, -0.24, { sx: 0.5, sy: 0.42, sz: 0.09, col, k });
      ponerL('piedra', G.disco, Pv, 0, 0.48, -0.24, { rx: Math.PI / 2, sx: 0.5, sy: 0.09, sz: 0.5, col, k });
    } else {
      ponerL('piedra', G.caja, Pv, 0, 0.24, 0, { sx: 0.58, sy: 0.48, sz: 0.18, col, k });
      ponerL('piedra', G.prisma, Pv, 0, 0.48, 0, { sx: 0.6, sy: 0.14, sz: 0.2, col, k: k * 0.9 });
    }
  }
  function cipres(x, z, s) {
    poner('tronco', G.tronco, x, 0.3 * s, z, { sx: 0.17 * s, sy: 0.6 * s, sz: 0.17 * s });
    poner('seto', G.cono, x, 0.45 * s + 1.65 * s, z, { ry: R() * 6.28, sx: 0.95 * s, sy: 3.3 * s, sz: 0.95 * s, k: 0.7 + R() * 0.3 });
  }
  function mausoleo(x, z, ry, w, d, h, grande) {
    const B = marco(x, z, ry), k = 0.75 + R() * 0.25, rh = 0.45 + w * 0.2, dw = Math.min(0.8, w * 0.55), dh = Math.min(1.7, h * 0.72);
    ponerL('piedra', G.caja, B, 0, 0.08, 0, { sx: w + 0.28, sy: 0.16, sz: d + 0.28, k: k * 0.8 });
    ponerL('bloque', G.caja, B, 0, h / 2, 0, { sx: w, sy: h, sz: d, k });
    ponerL('piedra', G.caja, B, 0, h + 0.07, 0, { sx: w + 0.2, sy: 0.14, sz: d + 0.2, k: k * 0.9 });
    ponerL('techo', G.prisma, B, 0, h + 0.14, 0, { sx: w + 0.3, sy: rh, sz: d + 0.3, k: 0.85 + R() * 0.2 });
    ponerL('hierro', G.caja, B, 0, dh / 2 + 0.05, d / 2 + 0.02, { sx: dw, sy: dh, sz: 0.05 });
    ponerL('piedra', G.caja, B, 0, dh + 0.12, d / 2 + 0.04, { sx: dw + 0.3, sy: 0.15, sz: 0.1, k });
    [-1, 1].forEach(s => ponerL('piedra', G.caja, B, s * (dw / 2 + 0.07), (dh + 0.1) / 2, d / 2 + 0.04, { sx: 0.13, sy: dh + 0.1, sz: 0.1, k }));
    ponerL('piedra', G.caja, B, 0, 0.06, d / 2 + 0.24, { sx: dw + 0.5, sy: 0.12, sz: 0.36, k: k * 0.85 });
    ponerL('piedra', G.caja, B, 0, h + 0.14 + rh + 0.26, d / 2 + 0.1, { sx: 0.08, sy: 0.56, sz: 0.08, k });
    ponerL('piedra', G.caja, B, 0, h + 0.14 + rh + 0.34, d / 2 + 0.1, { sx: 0.32, sy: 0.08, sz: 0.08, k });
    if (grande) [-1, 1].forEach(s => {
      ponerL('piedra', G.cil, B, s * (w / 2 - 0.22), h / 2, d / 2 + 0.22, { sx: 0.26, sy: h, sz: 0.26, k: k * 1.05 });
      ponerL('piedra', G.caja, B, s * (w / 2 - 0.22), h - 0.05, d / 2 + 0.22, { sx: 0.34, sy: 0.12, sz: 0.34, k });
    });
    // Paredes para hiedra, hueco de la puerta (ojos) y telarañas en el marco
    const pt = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(B);
    [[w / 2, 0, Math.PI / 2, d], [-w / 2, 0, -Math.PI / 2, d], [0, -d / 2, Math.PI, w]].forEach(([lx, lz, a, mw]) => { const p = pt(lx, h, lz); paredes.push({ x: p.x, y: h, z: p.z, ry: ry + a, maxW: mw * 0.9, maxH: h * 0.85 }); });
    const hp = pt(0, 0, d / 2 + 0.06), lp = pt(0, 0, (grande ? C : C / 2) + 0.05); huecos.push([hp.x, 0, hp.z, ry, lp.x, lp.z]);
    if (R() < 0.5) telaB(B, 'tl', 0.32 + R() * 0.16, -dw / 2, dh + 0.045, d / 2 + 0.06);
    if (R() < 0.35) telaB(B, 'tr', 0.28 + R() * 0.14, dw / 2, dh + 0.045, d / 2 + 0.06);
  }
  // Reja con barrotes y puntas de lanza, de (ax,az) a (bx,bz) a la altura y0..y0+h
  function reja(ax, az, bx, bz, y0, h, esp, puntas) {
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, ry = rotAlong(dx, dz), n = Math.max(1, Math.round(len / esp));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      poner('hierro', G.caja, px, y0 + h / 2, pz, { ry, sx: 0.024, sy: h, sz: 0.024 });
      if (puntas) poner('hierro', G.punta, px, y0 + h + 0.05, pz, { ry: ry + Math.PI / 4, sx: 0.055, sy: 0.11, sz: 0.055 });
    }
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    poner('hierro', G.caja, cx, y0 + 0.09, cz, { ry, sx: len, sy: 0.03, sz: 0.03 });
    poner('hierro', G.caja, cx, y0 + h - 0.09, cz, { ry, sx: len, sy: 0.03, sz: 0.03 });
  }

  // ---------- Tipos de parcela ----------
  const tipo = new Map(), sinHierba = new Set(), bloques = [];
  for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) {
    const cs = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
    if (!cs.every(([a, b]) => at(a, b) === '#' && !esBorde(a, b) && !tipo.has(b * W + a))) continue;
    if (R() > 0.6) continue;
    cs.forEach(([a, b]) => { tipo.set(b * W + a, 'mausoleo'); sinHierba.add(b * W + a); }); bloques.push([x, y]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== '#' || tipo.has(y * W + x)) continue;
    if (esBorde(x, y)) { tipo.set(y * W + x, 'tumbas'); continue; }
    const reg = hh(x >> 2, y >> 2);
    let k = reg < 0.5 ? 'tumbas' : reg < 0.74 ? 'seto' : 'cipres';
    if (R() < 0.3) k = 'tumbas';
    if (k === 'tumbas' && R() < 0.07) { k = 'capilla'; sinHierba.add(y * W + x); }
    tipo.set(y * W + x, k);
  }

  // Entrada: si la celda S toca la barda sur, ahí va la reja cerrada (la que se cruzó en la entrada)
  const S0 = mapa.inicio && { x: mapa.inicio.cx, y: mapa.inicio.cy };
  const reja0 = S0 && S0.y === H - 2 && at(S0.x, H - 1) === '#' ? { x: S0.x, y: H - 1 } : null;

  // ---------- Orillas: guarnición + postes + reja baja, o seto ----------
  const esp = baja ? 0.24 : 0.17;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== '#') continue;
    const k = tipo.get(y * W + x);
    N4.forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy; if (!dentro(nx, ny) || esMuro(nx, ny)) return;
      if (reja0 && x === reja0.x && y === reja0.y && nx === S0.x && ny === S0.y) return;
      const ex = (x + .5 + dx * .5) * C, ez = (y + .5 + dy * .5) * C, ax = dy, az = -dx, ry = rotAlong(ax, az);
      if (k === 'seto') {
        const hS = 1.62 + R() * 0.16;
        poner('seto', G.caja, ex - dx * 0.31, hS / 2, ez - dy * 0.31, { ry, sx: C + 0.02, sy: hS, sz: 0.6, k: 0.75 + R() * 0.3 });
        return;
      }
      const kc = 0.62 + R() * 0.2, L2 = C / 2 - 0.13;
      poner('piedra', G.caja, ex - dx * 0.11, 0.14, ez - dy * 0.11, { ry, sx: C - 0.5, sy: 0.28, sz: 0.22, k: kc });
      [-1, 1].forEach(s => {
        const px = ex - dx * 0.13 + ax * s * L2, pz = ez - dy * 0.13 + az * s * L2;
        poner('piedra', G.caja, px, 0.27, pz, { ry, sx: 0.26, sy: 0.54, sz: 0.26, k: kc * 1.05 });
        poner('piedra', G.caja, px, 0.57, pz, { ry, sx: 0.32, sy: 0.06, sz: 0.32, k: kc });
      });
      if (k === 'tumbas') reja(ex - dx * 0.11 - ax * (L2 - 0.15), ez - dy * 0.11 - az * (L2 - 0.15), ex - dx * 0.11 + ax * (L2 - 0.15), ez - dy * 0.11 + az * (L2 - 0.15), 0.28, 0.82, esp, !baja);
      if (k === 'tumbas' && R() < 0.08) telaB(marco(ex - dx * 0.085 + ax * (R() - .5), ez - dy * 0.085 + az * (R() - .5), Math.atan2(dx, dy)), null, 0.36 + R() * 0.2, 0, 0.62 + R() * 0.25, 0);
    });
  }

  // ---------- Contenido de cada parcela ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = tipo.get(y * W + x); if (!k || k === 'mausoleo') continue;
    const cx = (x + .5) * C, cz = (y + .5) * C;
    const f = N4.find(([dx, dy]) => dentro(x + dx, y + dy) && !esMuro(x + dx, y + dy)) || N4[Math.floor(R() * 4)];
    const ry = Math.atan2(f[0], f[1]);
    if (k === 'tumbas') {
      if (R() < 0.05) arbolesDentro.push([cx + (R() - .5) * 0.6, cz + (R() - .5) * 0.6]);
      const B = marco(cx, cz, ry), n = 1 + Math.floor(R() * 2.6);
      for (let i = 0; i < n; i++) lapidaDeco(B, n === 1 ? (R() - .5) * 0.3 : -0.48 + i * (0.96 / (n - 1)) + (R() - .5) * 0.08, -0.22 + (R() - .5) * 0.2);
    } else if (k === 'cipres') {
      const n = R() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) cipres(cx + (n === 1 ? 0 : (i ? 0.45 : -0.45)) + (R() - .5) * 0.2, cz + (R() - .5) * 0.4, 0.85 + R() * 0.35);
    } else if (k === 'seto') {
      if (R() < 0.35) cipres(cx + (R() - .5) * 0.3, cz + (R() - .5) * 0.3, 0.8 + R() * 0.3);
    } else if (k === 'capilla') mausoleo(cx, cz, ry, 1.2, 1.15, 1.85 + R() * 0.35, false);
  }
  bloques.forEach(([x, y]) => {
    const lados = [
      [[0, -1], [[x, y - 1], [x + 1, y - 1]]], [[0, 1], [[x, y + 2], [x + 1, y + 2]]],
      [[-1, 0], [[x - 1, y], [x - 1, y + 1]]], [[1, 0], [[x + 2, y], [x + 2, y + 1]]],
    ].filter(([, cs]) => cs.some(([a, b]) => dentro(a, b) && !esMuro(a, b)));
    const f = lados.length ? lados[Math.floor(R() * lados.length)][0] : [0, 1];
    mausoleo((x + 1) * C, (y + 1) * C, Math.atan2(f[0], f[1]), 3.1, 2.6, 2.5 + R() * 0.6, true);
  });

  // ---------- Barda perimetral alta con reja ----------
  const M0 = mapa.puerta;
  function tramoAlto(ax, az, bx, bz, inx, inz) {
    const ox = inx * 0.25, oz = inz * 0.25, len = Math.hypot(bx - ax, bz - az), ry = rotAlong((bx - ax) / len, (bz - az) / len);
    paredes.push({ x: (ax + bx) / 2 + inx * 0.5, y: 0.92, z: (az + bz) / 2 + inz * 0.5, ry: Math.atan2(inx, inz), maxW: len * 0.9, maxH: 0.8 });
    poner('bloque', G.caja, (ax + bx) / 2 + ox, 0.45, (az + bz) / 2 + oz, { ry, sx: len, sy: 0.9, sz: 0.5, k: 0.72 + R() * 0.15 });
    poner('piedra', G.caja, (ax + bx) / 2 + ox, 0.94, (az + bz) / 2 + oz, { ry, sx: len, sy: 0.08, sz: 0.58, k: 0.7 });
    reja(ax + ox, az + oz, bx + ox, bz + oz, 0.98, 1.5, baja ? 0.22 : 0.16, true);
  }
  function pilar(x, z, h = 2.9) {
    poner('bloque', G.caja, x, h / 2, z, { sx: 0.6, sy: h, sz: 0.6, k: 0.8 });
    poner('piedra', G.caja, x, h + 0.06, z, { sx: 0.74, sy: 0.12, sz: 0.74, k: 0.75 });
    poner('piedra', G.piram, x, h + 0.32, z, { ry: Math.PI / 4, sx: 0.5, sy: 0.4, sz: 0.5, k: 0.75 });
  }
  const lados = [
    { n: W, p: i => [i * C, 0], q: i => [(i + 1) * C, 0], in: [0, 1], celda: i => [i, 0] },
    { n: W, p: i => [i * C, H * C], q: i => [(i + 1) * C, H * C], in: [0, -1], celda: i => [i, H - 1] },
    { n: H, p: i => [0, i * C], q: i => [0, (i + 1) * C], in: [1, 0], celda: i => [0, i] },
    { n: H, p: i => [W * C, i * C], q: i => [W * C, (i + 1) * C], in: [-1, 0], celda: i => [W - 1, i] },
  ];
  lados.forEach(L => {
    for (let i = 0; i < L.n; i++) {
      const [cx, cy] = L.celda(i);
      const salta = (M0 && cx === M0.x && cy === M0.y) || (reja0 && cx === reja0.x && cy === reja0.y && L.in[1] === -1);
      const [ax, az] = L.p(i), [bx, bz] = L.q(i);
      if (!salta) tramoAlto(ax, az, bx, bz, L.in[0], L.in[1]);
      if (i % 2 === 0 || i === L.n - 1) {
        const [px, pz] = i % 2 === 0 ? [ax, az] : [bx, bz], qx = px + L.in[0] * 0.25, qz = pz + L.in[1] * 0.25; pilar(qx, qz);
        const alx = L.in[1], alz = -L.in[0], ryw = rotAlong(alx, alz), ix = L.in[0] * 0.03, iz = L.in[1] * 0.03;
        if (R() < 0.3) telaB(marco(qx + ix + alx * 0.3, qz + iz + alz * 0.3, ryw), 'tl', 0.45 + R() * 0.3, 0, 2.39, 0);
        if (R() < 0.3) telaB(marco(qx + ix - alx * 0.3, qz + iz - alz * 0.3, ryw), 'tr', 0.45 + R() * 0.3, 0, 2.39, 0);
      }
    }
  });

  // ---------- Reja de entrada, cerrada con cadena (detrás del jugador) ----------
  let farolLuz = null;
  if (reja0) {
    const x0 = reja0.x * C, x1 = (reja0.x + 1) * C, z0 = reja0.y * C, z1 = H * C;
    tramoAlto(x0, z0, x0, z1, -1, 0); tramoAlto(x1, z0, x1, z1, 1, 0);
    [x0, x1].forEach(px => {
      pilar(px, z0 + 0.05, 3.2);
      poner('hierro', G.caja, px, 3.62, z0 + 0.05, { sx: 0.24, sy: 0.04, sz: 0.24 });
      poner('farol', G.caja, px, 3.77, z0 + 0.05, { sx: 0.16, sy: 0.26, sz: 0.16 });
      poner('hierro', G.piram, px, 4.0, z0 + 0.05, { ry: Math.PI / 4, sx: 0.26, sy: 0.18, sz: 0.26 });
    });
    const hojaW = (C - 0.62) / 2;
    [-1, 1].forEach(s => {
      const xa = (x0 + x1) / 2 + s * 0.02, xb = (x0 + x1) / 2 + s * (hojaW + 0.02), zg = z0 + 0.05;
      binForzado = 'hoja' + s; pivotes['hoja' + s] = [xb, 0, zg];
      reja(Math.min(xa, xb), zg, Math.max(xa, xb), zg, 0.06, 2.3, 0.12, true);
      poner('hierro', G.caja, (xa + xb) / 2, 1.2, zg, { sx: hojaW, sy: 0.035, sz: 0.035 });
      poner('hierro', G.caja, xb, 1.2, zg, { sx: 0.045, sy: 2.3, sz: 0.045 });
      binForzado = null;
    });
    binForzado = 'cadena'; pivotes.cadena = [(x0 + x1) / 2, 1.2, z0 + 0.02];
    for (let i = -3; i <= 3; i++) poner('hierro', G.anillo, (x0 + x1) / 2 + i * 0.06, 1.2 + Math.cos(i * 0.5) * 0.02, z0 + 0.02, { ry: i % 2 ? Math.PI / 2 : 0, col: 0x9a9aa0, k: 2.2 });
    poner('hierro', G.caja, (x0 + x1) / 2, 1.08, z0 - 0.01, { sx: 0.1, sy: 0.12, sz: 0.05, col: 0xb08a4a, k: 2.4 });
    binForzado = null;
    farolLuz = new THREE.PointLight(0xffc98a, 7, 11, 2); farolLuz.position.set((x0 + x1) / 2, 3.4, z0 - 0.6); grupo.add(farolLuz);
    halosE = [x0, x1].map(px => { const h = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xffbf73, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }))); h.position.set(px, 3.77, z0 + 0.05); h.scale.setScalar(1.3); h.name = 'farol_halo'; grupo.add(h); return h; });
    telaB(marco(x0 + 0.3, z0 - 0.02, 0), 'tl', 0.5, 0, 2.32, 0); telaB(marco(x1 - 0.3, z0 - 0.02, 0), 'tr', 0.4, 0, 2.32, 0);
    objetivos.push({ tipo: 'reja', nombre: 'Reja', x: reja0.x, y: reja0.y, f: [0, -1], p: new THREE.Vector3((x0 + x1) / 2, 1.2, z0), fp: new THREE.Vector3((x0 + x1) / 2, 0, z0 - 0.06) });
  }

  // ---------- Fachada del Mausoleo alrededor de la puerta ----------
  if (M0) {
    const B = marco((M0.x + .5) * C, (M0.y + .5) * C, Math.atan2(M0.f[0], M0.f[1])), w = 3.9, d = C + 2.6, h = 3.4, z0 = C / 2;
    ponerL('bloque', G.caja, B, 0, h / 2, z0 - d / 2, { sx: w, sy: h, sz: d, k: 0.85 });
    ponerL('piedra', G.caja, B, 0, h + 0.1, z0 - d / 2, { sx: w + 0.3, sy: 0.2, sz: d + 0.3, k: 0.85 });
    ponerL('techo', G.prisma, B, 0, h + 0.2, z0 - d / 2, { sx: w + 0.5, sy: 1.5, sz: d + 0.4, k: 0.9 });
    [-1, 1].forEach(s => {
      ponerL('piedra', G.caja, B, s * 1.55, h / 2, z0 + 0.06, { sx: 0.34, sy: h, sz: 0.14, k: 0.95 });
      ponerL('piedra', G.caja, B, s * 1.55, h - 0.1, z0 + 0.08, { sx: 0.44, sy: 0.16, sz: 0.18, k: 0.9 });
      ponerL('piedra', G.cil, B, s * 2.25, 0.4, z0 - 0.4, { sx: 0.5, sy: 0.8, sz: 0.5, k: 0.8 });
    });
    ponerL('piedra', G.caja, B, 0, h + 1.95, z0 + 0.12, { sx: 0.12, sy: 0.9, sz: 0.12, k: 0.9 });
    ponerL('piedra', G.caja, B, 0, h + 2.1, z0 + 0.12, { sx: 0.5, sy: 0.12, sz: 0.12, k: 0.9 });
    sinHierba.add(M0.y * W + M0.x);
  }

  // ---------- Afuera: tumbas sueltas y árboles secos (se pierden en la niebla) ----------
  const fuera = () => {
    for (let i = 0; i < 30; i++) {
      const lado = Math.floor(R() * 4), t = R(), dd = 1.2 + R() * 9;
      const p = lado === 0 ? [t * W * C, -dd] : lado === 1 ? [t * W * C, H * C + dd] : lado === 2 ? [-dd, t * H * C] : [W * C + dd, t * H * C];
      if (reja0 && Math.abs(p[0] - (reja0.x + .5) * C) < 3 && p[1] > H * C) continue;
      if (M0 && Math.abs(p[0] - (M0.x + .5) * C) < 4 && p[1] < 0) continue;
      return p;
    }
    return [-6, -6];
  };
  const nT = baja ? 18 : 36;
  for (let i = 0; i < nT; i++) { const [x, z] = fuera(); lapidaDeco(marco(x, z, R() * 6.28), 0, 0, 0.8); }
  const up = new THREE.Vector3(0, 1, 0), qq = new THREE.Quaternion();
  function rama(px, py, pz, dir, len, rad, nivel) {
    qq.setFromUnitVectors(up, dir);
    poner('tronco', G.tronco, px + dir.x * len / 2, py + dir.y * len / 2, pz + dir.z * len / 2, { q: qq, sx: rad * 2, sy: len, sz: rad * 2 });
    if (nivel >= 3) return;
    const ex = px + dir.x * len, ey = py + dir.y * len, ez = pz + dir.z * len, n = 2 + Math.floor(R() * 2);
    for (let i = 0; i < n; i++) {
      const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(R() - .5, 0, R() - .5).normalize(), 0.5 + R() * 0.5);
      d2.y = Math.max(0.15, d2.y); d2.normalize();
      rama(ex, ey, ez, d2, len * (0.62 + R() * 0.12), rad * 0.6, nivel + 1);
    }
  }
  for (let i = 0; i < (baja ? 4 : 7); i++) {
    const [x, z] = fuera(); rama(x, 0, z, new THREE.Vector3((R() - .5) * 0.2, 1, (R() - .5) * 0.2).normalize(), 2.2 + R() * 1.2, 0.16 + R() * 0.06, 0);
    telaB(marco(x + (R() - .5) * 0.5, z + (R() - .5) * 0.5, R() * 6.28), null, 0.7 + R() * 0.4, 0, 2.3 + R() * 0.6, 0);
  }
  arbolesDentro.forEach(([x, z]) => {
    rama(x, 0, z, new THREE.Vector3((R() - .5) * 0.15, 1, (R() - .5) * 0.15).normalize(), 1.9 + R() * 0.8, 0.13 + R() * 0.04, 0);
    if (R() < 0.6) telaB(marco(x, z, R() * 6.28), null, 0.6 + R() * 0.3, 0, 2.1 + R() * 0.5, 0);
  });

  // ---------- Bancos de niebla en el horizonte (afuera de la barda) ----------
  const bancoTex = (() => { const Wb = 512, Hb = 128, n = fbm(rng(91), Wb, Hb, 8, 2, 5), cv = document.createElement('canvas'); cv.width = Wb; cv.height = Hb; const g = cv.getContext('2d'), im = g.createImageData(Wb, Hb);
    for (let i = 0, j = 0; i < Wb * Hb; i++, j += 4) { const x = i % Wb, y = (i / Wb) | 0, u = x / Wb * 2 - 1; im.data[j] = im.data[j + 1] = im.data[j + 2] = 255; im.data[j + 3] = (1 - sst(0.55, 1, Math.abs(u))) * sst(0.05, 0.7, y / Hb + (n[i] - 0.5) * 0.6) * 255; }
    g.putImageData(im, 0, 0); const t = keep(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })();
  [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([nx, nz]) => {
    [[3.5, 2.6, 0.32], [8, 3.6, 0.42], [13, 5, 0.55]].forEach(([dd, hgt, op], k) => {
      const lado = nx ? H * C : W * C, cx = W * C / 2 + nx * (W * C / 2 + dd), cz = H * C / 2 + nz * (H * C / 2 + dd);
      const m = new THREE.Mesh(G.plano, keep(new THREE.MeshBasicMaterial({ map: bancoTex, color: 0x1a1e27, transparent: true, opacity: op, depthWrite: false, fog: false })));
      m.scale.set(lado + dd * 2.4, hgt, 1); m.position.set(cx, hgt / 2 - 0.25, cz); m.rotation.y = Math.atan2(-nx, -nz); m.renderOrder = 1; m.name = 'niebla_banco';
      m.userData = { ph: k * 1.7 + nx * 3 + nz * 5, op }; grupo.add(m); bancos.push(m);
    });
  });

  // ---------- Construir mallas ----------
  bins.forEach((b, key) => {
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT[b.mat]); m.name = 'cem_' + key;
    if (b.mat === 'telaC' || b.mat === 'telaF') m.renderOrder = 2;
    if (b.grupo) {
      let pg = animados[b.grupo];
      if (!pg) { const pv = pivotes[b.grupo]; pg = animados[b.grupo] = new THREE.Group(); pg.position.set(pv[0], pv[1], pv[2]); pg.name = 'reja_' + b.grupo; grupo.add(pg); }
      m.position.set(-pg.position.x, -pg.position.y, -pg.position.z); pg.add(m);
    } else grupo.add(m);
  });
  bins.clear();
  Object.values(MAT).forEach(keep);

  return {
    grupo, sinHierba, paredes, huecos, objetivos,
    update(T, dt = 0.016) {
      if (farolLuz) { const f = 0.9 + 0.07 * Math.sin(T * 9.1) + 0.05 * Math.sin(T * 23); farolLuz.intensity = 7 * f; halosE.forEach(h => { h.material.opacity = 0.5 * f; }); }
      bancos.forEach(m => { m.material.opacity = m.userData.op * (0.85 + 0.15 * Math.sin(T * 0.2 + m.userData.ph)); });
      if (rattle >= 0) {
        rattle += dt; const t = rattle, k = t < 0.6 ? Math.sin(t * 36) * Math.exp(-t * 5.5) * 0.055 * rattleAmp : 0;
        if (animados['hoja-1']) animados['hoja-1'].rotation.y = k;
        if (animados.hoja1) animados.hoja1.rotation.y = -k * 0.92;
        if (animados.cadena) { animados.cadena.rotation.z = Math.sin(t * 22) * Math.exp(-t * 4) * 0.12 * rattleAmp; animados.cadena.position.z = pivotes.cadena[2] - Math.abs(k) * 0.6; }
        if (t > 0.9) { rattle = -1; Object.values(animados).forEach(a => a.rotation.set(0, 0, 0)); if (animados.cadena) animados.cadena.position.z = pivotes.cadena[2]; }
      }
    },
    // Tocar la reja de entrada: se sacude contra la cadena; cada intento seguido, más fuerte (vuelve a 1 tras 8 s)
    sacudirReja() { const now = performance.now() / 1000; if (now - ultimo > 8) intentos = 0; intentos++; ultimo = now; rattle = 0; rattleAmp = Math.min(2.2, 1 + (intentos - 1) * 0.35); return intentos; },
    dispose() { lib.forEach(o => o.dispose && o.dispose()); scene.remove(grupo); },
  };
}
