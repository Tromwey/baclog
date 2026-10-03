// Detalles del laberinto: neblina, hierba, hiedra, jirones, fuegos fatuos, ojos, una aparición, tres gatos
// y los encargos (objetos escondidos que cada gato espera).
// Todo procedural. update(dt, T) se llama solo cuando el juego no está en pausa.
import * as THREE from '../vendor/three.module.min.js';
import { fbm, rng } from './texturas.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDif = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function gris(W, H, fn) {
  const c = lienzo(W, H), g = c.getContext('2d'), im = g.createImageData(W, H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) { const v = clamp(fn(i, i % W, (i / W) | 0), 0, 1) * 255; im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}

// ---------- Texturas ----------
function canvasHierba(R) {
  const S = 128, c = lienzo(S, S), g = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x0 = 12 + R() * 104, h = 46 + R() * 78, lean = (R() - 0.5) * 56, w = 2 + R() * 2.6;
    g.fillStyle = `hsl(${46 + R() * 34},${22 + R() * 24}%,${20 + R() * 22}%)`;
    g.beginPath(); g.moveTo(x0 - w, S);
    g.quadraticCurveTo(x0 - w * 0.4 + lean * 0.35, S - h * 0.6, x0 + lean, S - h);
    g.quadraticCurveTo(x0 + w * 0.4 + lean * 0.35, S - h * 0.6, x0 + w, S); g.closePath(); g.fill();
  }
  return c;
}
function hoja(g, x, y, r, a) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r, -r * 0.15, 0, r); g.quadraticCurveTo(-r, -r * 0.15, 0, -r); g.fill(); g.restore(); }
function canvasHiedra(R) {
  const S = 256, c = lienzo(S, S), g = c.getContext('2d');
  for (let k = 0; k < 6; k++) {
    let x = 18 + R() * 220, y = -4; const len = 90 + R() * 170, pts = [];
    for (let s = 0; s < len; s += 6) { x += (R() - 0.5) * 6; y += 6; pts.push([x, y]); }
    g.strokeStyle = '#2a281b'; g.lineWidth = 2; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    pts.forEach(([px, py], i) => {
      if (i % 2) return;
      const lado = R() < 0.5 ? -1 : 1, r = (5 + R() * 6) * (1 - i / pts.length * 0.45);
      g.fillStyle = `hsl(${82 + R() * 34},${22 + R() * 22}%,${11 + R() * 13}%)`;
      hoja(g, px + lado * (4 + R() * 5), py + R() * 4, r, Math.PI / 2 + lado * (0.5 + R() * 0.7));
    });
  }
  return c;
}
function canvasCarey(R) {
  const S = 128, n1 = fbm(R, S, S, 5, 5, 4), n2 = fbm(R, S, S, 16, 16, 2), c = lienzo(S, S), g = c.getContext('2d'), im = g.createImageData(S, S);
  for (let i = 0, j = 0; i < S * S; i++, j += 4) {
    const v = n1[i] + (n2[i] - 0.5) * 0.4, k = n2[i];
    let r = 24, gg = 18, b = 15;                                         // negro
    if (v > 0.56) { r = 176 + k * 50; gg = 84 + k * 40; b = 28 + k * 18; }  // naranja
    else if (v > 0.5) { const m = (v - 0.5) / 0.06 * (k > 0.5 ? 1 : 0.4); r = 24 + m * 120; gg = 18 + m * 52; b = 15 + m * 10; } // atigrado entre manchas
    im.data[j] = r; im.data[j + 1] = gg; im.data[j + 2] = b; im.data[j + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
function canvasFantasma() {
  const Wc = 256, Hc = 512, c = lienzo(Wc, Hc), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, Wc, Hc);
  const borroso = (blur, color, dibujar) => { g.save(); g.shadowColor = color; g.shadowBlur = blur; g.shadowOffsetX = 3000; g.translate(-3000, 0); g.fillStyle = color; dibujar(); g.restore(); };
  borroso(22, '#fff', () => {
    g.beginPath(); g.ellipse(128, 98, 40, 52, 0, 0, 6.29); g.fill();
    g.beginPath(); g.moveTo(90, 124); g.bezierCurveTo(58, 210, 46, 360, 34, 500); g.lineTo(222, 500); g.bezierCurveTo(210, 360, 198, 210, 166, 124); g.closePath(); g.fill();
  });
  borroso(14, 'rgba(0,0,0,.85)', () => { g.beginPath(); g.ellipse(128, 106, 22, 30, 0, 0, 6.29); g.fill(); });
  const gr = g.createLinearGradient(0, 300, 0, 512); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 300, Wc, 212);
  return c;
}

export function crearDeco({ scene, mapa, cam, P, linea, sfx = null, tema = 'muros', sinHierba = null, paredes = null, huecos = null, calidad = 'alta', reducido = false, semilla = 17, encargos = [], estadoEnc = {}, tumba = null, alEvento = () => {} }) {
  const { W, H, C, A, at, solido } = mapa;
  const R = rng(semilla), baja = calidad === 'baja';
  const grupo = new THREE.Group(); grupo.name = 'deco'; scene.add(grupo);
  const lib = [], keep = o => (lib.push(o), o);
  const tx = (c, o = {}) => {
    const t = keep(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (o.srgb) t.colorSpace = THREE.SRGBColorSpace; if (o.rep) t.repeat.set(o.rep[0], o.rep[1]); return t;
  };
  const esMuro = c => c === '#' || c === 'M';
  const pisos = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!solido(x, y)) pisos.push([x, y]);
  const centro = ([x, y]) => [(x + .5) * C, (y + .5) * C];
  const celda = (x, z) => [Math.floor(x / C), Math.floor(z / C)];
  const uT = { value: 0 };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const tv = new THREE.Vector3(), fw = new THREE.Vector3();
  const PLANO = keep(new THREE.PlaneGeometry(1, 1));
  const glowMap = tx(gris(64, 64, (i, x, y) => Math.pow(1 - sstep(0, 1, Math.hypot(x - 31.5, y - 31.5) / 32), 2.2)), { clamp: true });

  function buscarPiso(minD, maxD, { vista = null, cono = -2, intentos = 80 } = {}) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (let i = 0; i < intentos; i++) {
      const c = pisos[Math.floor(R() * pisos.length)], [cx, cz] = centro(c), dx = cx - P.x, dz = cz - P.z, d = Math.hypot(dx, dz);
      if (d < minD || d > maxD) continue;
      if (cono > -2 && (dx * fx + dz * fz) / (d || 1) < cono) continue;
      if (vista !== null && linea(P.x, P.z, cx, cz) !== vista) continue;
      return c;
    }
    return null;
  }
  const panDe = (x, z) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1; return clamp((dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / d, -1, 1) * 0.85; };

  // ---------- Hierba: matas al pie de los muros y algunas sueltas; se mecen con el viento ----------
  const hierbaGeo = (() => {
    const g = new THREE.BufferGeometry(), p = [], u = [], n = [], idx = [];
    [[1, 0], [0, 1]].forEach(([ax, az]) => {
      const b = p.length / 3; p.push(-ax * .5, 0, -az * .5, ax * .5, 0, az * .5, ax * .5, 1, az * .5, -ax * .5, 1, -az * .5);
      u.push(0, 0, 1, 0, 1, 1, 0, 1); for (let i = 0; i < 4; i++) n.push(0, 1, 0); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setIndex(idx); return keep(g);
  })();
  const viento = reducido ? 0.03 : 0.075;
  const matHierba = keep(new THREE.MeshLambertMaterial({ map: tx(canvasHierba(R), { srgb: true }), alphaTest: 0.45, side: THREE.DoubleSide }));
  matHierba.onBeforeCompile = sh => {
    sh.uniforms.uT = uT;
    sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 ip = vec2(0.0);
      #endif
      float wv = sin(uT * 1.6 + ip.x * 0.8 + ip.y * 0.6) + 0.5 * sin(uT * 2.9 + ip.x * 1.7);
      transformed.x += wv * ${viento.toFixed(3)} * uv.y * uv.y;
      transformed.z += wv * ${(viento * 0.6).toFixed(3)} * uv.y * uv.y;`);
  };
  const matas = [];
  for (const [x, y] of pisos) {
    N4.forEach(([dx, dy]) => {
      if (!esMuro(at(x + dx, y + dy))) return;
      const k = (baja ? 2 : 3) + (R() < 0.55 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const along = (R() - .5) * C * 0.92, into = C / 2 - 0.08 - R() * 0.24;
        matas.push([(x + .5) * C + dx * into + dy * along, (y + .5) * C + dy * into + dx * along, 1]);
      }
    });
    if (R() < (baja ? 0.06 : 0.14)) matas.push([(x + 0.15 + R() * 0.7) * C, (y + 0.15 + R() * 0.7) * C, 0.65]);
  }
  if (tema === 'cementerio') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== '#' || (sinHierba && sinHierba.has(y * W + x))) continue;
    for (let i = 0; i < (baja ? 2 : 4); i++) matas.push([(x + 0.12 + R() * 0.76) * C, (y + 0.12 + R() * 0.76) * C, 1.25]);
  }
  const hierba = new THREE.InstancedMesh(hierbaGeo, matHierba, matas.length); hierba.name = 'hierba';
  matas.forEach(([px, pz, f], i) => {
    const h = (0.24 + R() * 0.46) * f, w = 0.34 + R() * 0.4;
    m4.compose(v3.set(px, 0, pz), q.setFromEuler(e.set(0, R() * Math.PI, 0)), s3.set(w, h, w)); hierba.setMatrixAt(i, m4);
    hierba.setColorAt(i, col.setHSL(0.12 + R() * 0.08, 0.2 + R() * 0.2, 0.62 + R() * 0.3));
  });
  hierba.computeBoundingSphere(); grupo.add(hierba);

  // ---------- Hiedra colgando de algunos muros ----------
  const caras = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== '#') continue;
    N4.forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || esMuro(at(nx, ny))) return; caras.push([x, y, dx, dy]); });
  }
  const supHiedra = paredes ? paredes.filter(() => R() < (baja ? 0.25 : 0.45))
    : caras.filter(() => R() < (baja ? 0.1 : 0.2)).map(([x, y, dx, dy]) => ({ x: (x + .5 + dx * .5) * C, z: (y + .5 + dy * .5) * C, y: A + 0.02, ry: Math.atan2(dx, dy), maxW: C, maxH: 2.4 }));
  const planoArriba = keep(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0));
  const matHiedra = keep(new THREE.MeshLambertMaterial({ map: tx(canvasHiedra(R), { srgb: true }), alphaTest: 0.5, side: THREE.DoubleSide }));
  const hiedra = new THREE.InstancedMesh(planoArriba, matHiedra, Math.max(1, supHiedra.length)); hiedra.name = 'hiedra'; hiedra.count = supHiedra.length;
  supHiedra.forEach((s, i) => {
    const w = Math.min(s.maxW * 0.9, 0.9 + R() * 0.9), h = Math.min(s.maxH, 0.9 + R() * 1.5), along = (R() - .5) * Math.max(0, s.maxW - w);
    const tx_ = Math.cos(s.ry), tz_ = -Math.sin(s.ry), nx = Math.sin(s.ry), nz = Math.cos(s.ry);
    m4.compose(v3.set(s.x + tx_ * along + nx * 0.014, s.y + 0.02, s.z + tz_ * along + nz * 0.014), q.setFromEuler(e.set(0, s.ry, 0)), s3.set(w * (R() < 0.5 ? -1 : 1), h, 1)); hiedra.setMatrixAt(i, m4);
  });
  hiedra.computeBoundingSphere(); grupo.add(hiedra);

  // ---------- Neblina: capas a ras de suelo que se desplazan; la linterna las ilumina ----------
  const nieblaC = gris(256, 256, (() => { const n = fbm(R, 256, 256, 4, 4, 5); return i => sstep(0.44, 0.8, n[i]); })());
  const planoSuelo = keep(new THREE.PlaneGeometry(W * C, H * C));
  const CAPAS = baja ? [[0.1, 6, 0.6, 0.03, 0.01], [0.4, 4, 0.36, -0.02, 0.014]]
    : [[0.07, 7, 0.62, 0.03, 0.01], [0.3, 5, 0.42, -0.022, 0.014], [0.62, 3.5, 0.26, 0.014, -0.009], [1.05, 2.5, 0.12, -0.01, 0.006]];
  const capas = CAPAS.map(([y, rep, op, vx, vz]) => {
    const map = tx(nieblaC, { rep: [rep, rep] });
    const m = new THREE.Mesh(planoSuelo, keep(tema === 'cementerio'
      ? new THREE.MeshLambertMaterial({ color: 0xa4acbe, emissive: 0x15181f, alphaMap: map, transparent: true, opacity: op, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x5f6678, alphaMap: map, transparent: true, opacity: op, depthWrite: false })));
    m.rotation.x = -Math.PI / 2; m.position.set(W * C / 2, y, H * C / 2); m.renderOrder = 2; m.name = 'neblina'; m.userData.v = [vx, vz]; grupo.add(m); return m;
  });

  // Jirones: bancos de niebla verticales que aparecen, derivan y se disuelven
  const puffMap = tx(gris(128, 64, (() => { const n = fbm(R, 128, 64, 4, 2, 4); return (i, x, y) => sstep(0.3, 0.75, n[i]) * (1 - sstep(0.4, 1, Math.hypot((x - 63.5) / 64, (y - 31.5) / 32))); })()), { clamp: true });
  function reubicarJiron(j, inicio) {
    const c = buscarPiso(inicio ? 0 : 2.5, 13) || pisos[Math.floor(R() * pisos.length)], [cx, cz] = centro(c);
    j.m.position.set(cx + (R() - .5), 0.35 + R() * 0.7, cz + (R() - .5)); j.m.scale.set(3 + R() * 3.5, 1.1 + R() * 1.1, 1);
    j.vida = 12 + R() * 14; j.t = inicio ? R() * j.vida : 0; j.op = 0.3 + R() * 0.25; const a = R() * 6.28; j.vx = Math.cos(a) * 0.12; j.vz = Math.sin(a) * 0.12;
  }
  const jirones = Array.from({ length: baja ? 8 : 18 }, () => {
    const m = new THREE.Mesh(PLANO, keep(tema === 'cementerio'
      ? new THREE.MeshLambertMaterial({ color: 0xa8b0c2, emissive: 0x171a22, alphaMap: puffMap, transparent: true, opacity: 0, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x656c7e, alphaMap: puffMap, transparent: true, opacity: 0, depthWrite: false })));
    m.renderOrder = 3; m.name = 'jiron'; grupo.add(m); const j = { m }; reubicarJiron(j, true); return j;
  });

  // ---------- Fuegos fatuos: luces que flotan, se apagan si te acercas y aparecen en otro lado ----------
  const NF = baja ? 7 : 12, fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 3), fGeo = keep(new THREE.BufferGeometry());
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const puntos = new THREE.Points(fGeo, keep(new THREE.PointsMaterial({ size: 0.24, map: glowMap, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  puntos.frustumCulled = false; puntos.name = 'fuegos_fatuos'; grupo.add(puntos);
  const CF = new THREE.Color(0x7fe0c0);
  function reubicarFuego(f, inicio) {
    const c = buscarPiso(inicio ? 4 : 6, 17) || pisos[Math.floor(R() * pisos.length)], [cx, cz] = centro(c);
    Object.assign(f, { x: cx + (R() - .5) * 0.8, z: cz + (R() - .5) * 0.8, y: 0.6 + R() * 0.9, t: inicio ? R() * 6 : 0, vida: 7 + R() * 9, huye: 0 });
  }
  const fuegos = Array.from({ length: NF }, () => { const f = { ph: R() * 6.28 }; reubicarFuego(f, true); return f; });

  // ---------- Ojos que miran desde el fondo de un pasillo y parpadean al apagarse ----------
  const ESF = keep(new THREE.SphereGeometry(1, 14, 10));
  const pares = Array.from({ length: 2 }, () => {
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0xcfeeb0, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    const g = new THREE.Group(), a = new THREE.Mesh(ESF, mat), b = new THREE.Mesh(ESF, mat); g.add(a, b); g.visible = false; g.name = 'ojos'; grupo.add(g);
    return { g, a, b, mat, activo: false, t: 0, vida: 0, parp: 0, sale: 0, r: 0.015 };
  });
  let ojosT = 7;
  function colocarOjos(p, forzar) {
    // A veces miran desde el hueco de la puerta de un mausoleo
    if (huecos && huecos.length && R() < 0.55) {
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const ops = huecos.filter(h => { const dx = h[0] - P.x, dz = h[2] - P.z, dd = Math.hypot(dx, dz); return dd > 4 && dd < 14 && (dx * fx + dz * fz) / dd > (forzar ? 0.3 : 0.5) && linea(P.x, P.z, h[4], h[5]); });
      if (ops.length) {
        const h = ops[Math.floor(R() * ops.length)], sep = 0.06, o = (R() - .5) * 0.3;
        p.r = 0.017; p.g.position.set(h[0] + Math.cos(h[3]) * o, 1.1 + R() * 0.45, h[2] - Math.sin(h[3]) * o); p.g.rotation.y = h[3];
        p.a.position.set(-sep / 2, 0, 0); p.b.position.set(sep / 2, 0, 0); p.mat.color.setHex(R() < 0.3 ? 0xff9a6a : 0xcfeeb0);
        Object.assign(p, { activo: true, t: 0, vida: 5 + R() * 6, sale: 0, parp: 0 }); p.g.visible = true; return true;
      }
    }
    const c = buscarPiso(forzar ? 4 : 6, 13, { vista: true, cono: forzar ? 0.3 : 0.55 }); if (!c) return false;
    const [cx, cz] = centro(c), bajo = R() < 0.6, sep = bajo ? 0.046 : 0.066;
    p.r = bajo ? 0.014 : 0.018;
    p.g.position.set(cx + (R() - .5) * 0.8, bajo ? 0.28 : 1.55, cz + (R() - .5) * 0.8); p.g.rotation.y = Math.atan2(P.x - cx, P.z - cz);
    p.a.position.set(-sep / 2, 0, 0); p.b.position.set(sep / 2, 0, 0);
    p.mat.color.setHex(R() < 0.25 ? 0xff9a6a : 0xcfeeb0);
    Object.assign(p, { activo: true, t: 0, vida: 5 + R() * 6, sale: 0, parp: 0 }); p.g.visible = true; return true;
  }

  // ---------- Aparición: una figura al fondo de un pasillo, solo por un momento ----------
  const fantMat = keep(new THREE.MeshBasicMaterial({ color: 0xc9d3ea, alphaMap: tx(canvasFantasma(), { clamp: true }), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const fant = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.95, 1.9).translate(0, 0.95, 0)), fantMat); fant.visible = false; fant.renderOrder = 4; fant.name = 'aparicion'; grupo.add(fant);
  const ap = { activa: false, t: 0, vida: 0, sale: 0, prox: 35 + R() * 30 };
  function intentarAparicion(forzar) {
    const c = buscarPiso(forzar ? 5 : 8.5, 14, { vista: true, cono: forzar ? 0.6 : 0.9, intentos: 140 }); if (!c) return false;
    const [cx, cz] = centro(c); fant.position.set(cx, 0, cz); fant.visible = true;
    Object.assign(ap, { activa: true, t: 0, vida: 1.6 + R() * 1.6, sale: 0 });
    if (sfx && sfx.susurro) sfx.susurro(0.8, panDe(cx, cz));
    return true;
  }

  // ---------- Gatos ----------
  const CIL = keep(new THREE.CylinderGeometry(1, 0.85, 1, 7).translate(0, -0.5, 0)), CONO = keep(new THREE.ConeGeometry(1, 1, 4));
  const TAPA_L = keep(new THREE.SphereGeometry(1, 12, 6, -Math.PI / 2 + 0.26, Math.PI - 0.52, 0, 1.2));
  const TAPA_R = keep(new THREE.SphereGeometry(1, 12, 6, Math.PI / 2 + 0.26, Math.PI - 0.52, 0, 1.2));
  const sombraMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: glowMap, transparent: true, opacity: 0.5, depthWrite: false }));
  const L = c => keep(new THREE.MeshLambertMaterial({ color: c }));
  const careyMap = tx(canvasCarey(R), { srgb: true });
  const PIEL = {
    // Tuxedo: negro con pecho, hocico y patas blancas
    tuxedo: () => { const n = L(0x1a1a1d), b = L(0xdcd8cf); return { cuerpo: n, pecho: b, cabeza: n, hocico: b, nariz: L(0xc4847e), orejas: n, pata: n, pie: b, cola: [n], tapa: null, ojos: [[0xb5c23e, 0xeaffb8], [0xb5c23e, 0xeaffb8]], tono: 1 }; },
    // Turkish van: blanco, manchas café en la cabeza (con raya blanca al centro), orejas y cola anillada y esponjosa; ojos azules
    van: () => { const b = L(0xe9e4d9), a = L(0x6e4b33), a2 = L(0x4f3524); return { cuerpo: b, pecho: b, cabeza: b, hocico: b, nariz: L(0xd29a92), orejas: a, pata: b, pie: b, cola: [a, a2], tapa: a, esponjosa: true, ojos: [[0x4f8fd6, 0xbfe4ff], [0x4f8fd6, 0xbfe4ff]], tono: 1.18 }; },
    // Carey: negro y naranja moteado, sin blanco
    carey: () => { const m = keep(new THREE.MeshLambertMaterial({ map: careyMap })), n = L(0x18130f); return { cuerpo: m, pecho: m, cabeza: m, hocico: m, nariz: L(0x2b1d18), orejas: n, pata: m, pie: n, cola: [m], tapa: null, ojos: [[0xd08a2a, 0xffe7a0], [0xd08a2a, 0xffe7a0]], tono: 0.9 }; },
  };
  function crearGato(tipo) {
    const M = PIEL[tipo]();
    const root = new THREE.Group(); root.name = 'gato_' + tipo;
    const add = (par, geo, mat, p, s, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(p[0], p[1], p[2]); o.scale.set(s[0], s[1], s[2]); if (r) o.rotation.set(r[0], r[1], r[2]); par.add(o); return o; };
    const cuerpo = new THREE.Group(); root.add(cuerpo);
    add(cuerpo, ESF, M.cuerpo, [0, 0.03, 0.13], [0.105, 0.1, 0.2]);
    add(cuerpo, ESF, M.cuerpo, [0, 0.02, 0.0], [0.1, 0.095, 0.1]);
    add(cuerpo, ESF, M.pecho, [0, 0.0, 0.262], [0.058, 0.072, 0.06]);
    const cuello = new THREE.Group(); cuello.position.set(0, 0.09, 0.3); cuerpo.add(cuello);
    const cabeza = new THREE.Group(); cabeza.position.set(0, 0.04, 0.035); cuello.add(cabeza);
    add(cabeza, ESF, M.cabeza, [0, 0, 0], [0.075, 0.066, 0.068]);
    if (M.tapa) { add(cabeza, TAPA_L, M.tapa, [0, 0, 0], [0.078, 0.069, 0.071]); add(cabeza, TAPA_R, M.tapa, [0, 0, 0], [0.078, 0.069, 0.071]); }
    add(cabeza, ESF, M.hocico, [0, -0.022, 0.05], [0.038, 0.028, 0.03]);
    add(cabeza, ESF, M.nariz, [0, -0.01, 0.078], [0.01, 0.007, 0.006]);
    const orejas = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.04, 0.05, 0); p.rotation.z = -sx * 0.3; p.userData.base = -sx * 0.3; cabeza.add(p); add(p, CONO, M.orejas, [0, 0.03, 0], [0.026, 0.06, 0.016]); return p; });
    const ojos = M.ojos.map(([base, brillo], k) => {
      const mat = keep(new THREE.MeshBasicMaterial({ color: base, fog: false }));
      return { o: add(cabeza, ESF, mat, [(k ? 1 : -1) * 0.029, 0.01, 0.058], [0.012, 0.011, 0.007]), mat, base: new THREE.Color(base), brillo: new THREE.Color(brillo) };
    });
    const pata = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); cuerpo.add(p); return { p, l: add(p, CIL, M.pata, [0, 0, 0], [0.02, 0.16, 0.02]), pie: add(p, ESF, M.pie, [0, -0.16, 0.012], [0.024, 0.016, 0.03]) }; };
    const del = [-1, 1].map(sx => pata(sx * 0.05, -0.02, 0.26)), tra = [-1, 1].map(sx => pata(sx * 0.06, -0.01, 0.02));
    const cola = []; let par = cuerpo;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Group(); s.position.set(0, i ? -0.055 : 0.05, i ? 0 : -0.085); par.add(s);
      const mc = M.cola[i % M.cola.length];
      if (M.esponjosa) {   // cola de plumero: más gruesa, con mechones que se abren hacia la punta
        const r = 0.03 + Math.sin((i + 1) / 7 * Math.PI) * 0.012;
        add(s, CIL, mc, [0, 0, 0], [r, 0.058, r]);
        add(s, ESF, mc, [0, -0.03, 0], [r * 1.35, 0.042, r * 1.35]);
        if (i > 1) [0, 2.1, 4.2].forEach(a => add(s, ESF, mc, [Math.cos(a + i) * r * 0.7, -0.026, Math.sin(a + i) * r * 0.7], [r * 0.75, 0.03, r * 0.75]));
      } else { const r = 0.019 * (1 - i * 0.09); add(s, CIL, mc, [0, 0, 0], [r, 0.058, r]); }
      cola.push(s); par = s;
    }
    const sombra = new THREE.Mesh(PLANO, sombraMat); sombra.rotation.x = -Math.PI / 2; sombra.position.set(0, 0.004, 0.06); sombra.scale.set(0.36, 0.56, 1); root.add(sombra);
    grupo.add(root);
    return { tipo, obj: root, cuerpo, cuello, cabeza, orejas, ojos, del, tra, cola, tono: M.tono,
      x: 0, z: 0, head: 0, s: 1, v: 0, velT: 0, fase: 0, estado: 'oculto', ruta: [], huye: false, tSent: 0, tOc: 0, esfuma: 0,
      cabY: 0, cabP: 0, ph: R() * 6.28, brillo: 0, parp: 0, tic: 0, notado: false, ve: false, veT: 0, tMiau: 0, tAmb: 20 + R() * 40 };
  }
  const gatos = ['tuxedo', 'van', 'carey'].map(crearGato);

  // ---------- Encargos: conejito azul para el van, leche para la carey, chalequito para el tuxedo ----------
  const pieza = (par, geo, mat, p, s, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(p[0], p[1], p[2]); o.scale.set(s[0], s[1], s[2]); if (r) o.rotation.set(r[0], r[1], r[2]); par.add(o); return o; };
  const MATE = {
    azul: L(0x4f80cf), azulC: L(0xb9cdeb), negro: keep(new THREE.MeshBasicMaterial({ color: 0x0c0c10 })), leche: L(0xf3efe4), boton: L(0xc9a04a),
    vidrio: keep(new THREE.MeshLambertMaterial({ color: 0xd6dee6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })),
    chaleco: keep(new THREE.MeshLambertMaterial({ color: 0x2c4c94, side: THREE.DoubleSide })),
  };
  function crearConejo() {
    const g = new THREE.Group(); g.name = 'conejito';
    pieza(g, ESF, MATE.azul, [0, 0.062, 0], [0.056, 0.062, 0.05]);
    pieza(g, ESF, MATE.azulC, [0, 0.055, 0.03], [0.034, 0.04, 0.026]);
    pieza(g, ESF, MATE.azul, [0, 0.142, 0.008], [0.044, 0.041, 0.04]);
    pieza(g, ESF, MATE.azulC, [0, 0.13, 0.04], [0.019, 0.014, 0.012]);
    [-1, 1].forEach(s => pieza(g, ESF, MATE.negro, [s * 0.017, 0.152, 0.039], [0.006, 0.007, 0.004]));
    pieza(g, ESF, MATE.azul, [-0.024, 0.226, -0.004], [0.014, 0.05, 0.009], [0, 0, 0.12]);    // oreja parada
    pieza(g, ESF, MATE.azul, [0.061, 0.19, -0.004], [0.014, 0.05, 0.009], [0, 0, -1.3]);      // oreja caída
    [-1, 1].forEach(s => pieza(g, ESF, MATE.azulC, [s * 0.032, 0.013, 0.035], [0.021, 0.013, 0.031]));
    [-1, 1].forEach(s => pieza(g, ESF, MATE.azul, [s * 0.05, 0.072, 0.022], [0.015, 0.03, 0.015], [0.5, 0, s * 0.35]));
    pieza(g, ESF, MATE.azulC, [0, 0.045, -0.05], [0.018, 0.018, 0.018]);
    return g;
  }
  const VASO = keep(new THREE.CylinderGeometry(0.042, 0.034, 0.12, 16, 1, true).translate(0, 0.06, 0));
  const LECHE = keep(new THREE.CylinderGeometry(0.039, 0.034, 1, 16).translate(0, 0.5, 0));
  const FONDO = keep(new THREE.CircleGeometry(0.034, 16).rotateX(-Math.PI / 2));
  function crearVaso() {
    const g = new THREE.Group(); g.name = 'vaso_leche';
    g.userData.leche = pieza(g, LECHE, MATE.leche, [0, 0.004, 0], [1, 0.096, 1]);
    pieza(g, VASO, MATE.vidrio, [0, 0, 0], [1, 1, 1]); pieza(g, FONDO, MATE.vidrio, [0, 0.003, 0], [1, 1, 1]);
    return g;
  }
  // Chaleco: franja de esfera con la abertura abajo (en el tuxedo deja ver el pecho blanco)
  const GAP = 1.1, CHAL = keep(new THREE.SphereGeometry(1, 20, 8, Math.PI / 2 + GAP / 2, Math.PI * 2 - GAP, 0.42, 1.25).rotateX(Math.PI / 2));
  function crearChaleco(sx, sy, sz) {
    const g = new THREE.Group(); g.name = 'chalequito';
    pieza(g, CHAL, MATE.chaleco, [0, 0, 0], [sx, sy, sz]);
    const ph = Math.PI / 2 + GAP / 2 + 0.12;
    [0.7, 1.0, 1.3].forEach(th => pieza(g, ESF, MATE.boton, [-Math.cos(ph) * Math.sin(th) * sx * 1.03, -Math.sin(ph) * Math.sin(th) * sy * 1.03, Math.cos(th) * sz * 1.03], [0.007, 0.007, 0.007]));
    return g;
  }
  // Señal de "se puede tomar": aro fijo en el suelo + aro que se expande y se apaga
  const ARO = keep(new THREE.RingGeometry(0.2, 0.235, 40).rotateX(-Math.PI / 2));
  function crearAros() {
    return [0, 1].map(i => {
      const m = new THREE.Mesh(ARO, keep(new THREE.MeshBasicMaterial({ color: 0xf0b060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
      m.renderOrder = 5; m.visible = false; m.name = i ? 'aro_pulso' : 'aro'; grupo.add(m); return m;
    });
  }
  function pintarAros(aros, x, z, k, ph, T, esc = 1) {
    const [a, b] = aros, u = (T * 0.6 + ph) % 1;
    a.visible = b.visible = k > 0.01; if (!a.visible) return;
    a.position.set(x, 0.016, z); a.scale.setScalar(esc); a.material.opacity = k * 0.5;
    b.position.set(x, 0.017, z); b.scale.setScalar(esc * (1 + u * (reducido ? 0.4 : 1.1))); b.material.opacity = k * 0.6 * (1 - u);
  }
  const encs = encargos.map(def => {
    const [cx, cy] = def.celda, f = N4.find(([dx, dy]) => !solido(cx + dx, cy + dy)) || [0, 1];
    const at_ = solido(cx - f[0], cy - f[1]) ? [-f[0], -f[1]] : (N4.find(([dx, dy]) => solido(cx + dx, cy + dy)) || [0, -1]);
    const lado = (R() - 0.5) * 0.7, x = (cx + .5) * C + at_[0] * 0.62 + at_[1] * lado, z = (cy + .5) * C + at_[1] * 0.62 + at_[0] * lado;
    const obj = def.gato === 'van' ? crearConejo() : def.gato === 'carey' ? crearVaso() : crearChaleco(0.12, 0.05, 0.19);
    const y0 = def.gato === 'tuxedo' ? 0.045 : 0, gy = def.gato === 'tuxedo' ? 0.09 : 0.17;
    obj.position.set(x, y0, z); obj.rotation.set(0, Math.atan2(f[0], f[1]) + (R() - .5) * 0.9, def.gato === 'van' ? 0.22 : 0); grupo.add(obj);
    const glint = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowMap, color: 0xfff1d2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    glint.position.set(x, gy, z); glint.renderOrder = 5; glint.name = 'brillo_' + def.id; grupo.add(glint);
    const e = { ...def, tipo: 'objeto', obj, glint, aros: crearAros(), f, x, z, y0, gy, p: new THREE.Vector3(x, 0.1, z), fp: new THREE.Vector3(x, 0, z), estado: estadoEnc[def.id] || 'escondido', saca: 0, ph: R() * 6.28, ve: false, veT: 0, cerca: false, cercaT: 0 };
    if (e.estado !== 'escondido') obj.visible = glint.visible = false;
    return e;
  });
  gatos.forEach(g => {
    Object.assign(g, { tRuta: 0, bebe: 0, pop: 0, popObj: null, popS: 1, extra: null, vaso: null, ac: 0, acT: 0, tAc: 0, final: null, spot: null, espera: false, tGuia: 0, tLlamar: 0 });
    if (g.tipo === 'tuxedo') { g.extra = crearChaleco(0.113, 0.108, 0.214); g.extra.position.set(0, 0.03, 0.13); g.cuerpo.add(g.extra); }
    else if (g.tipo === 'van') { g.extra = crearConejo(); g.popS = 0.62; g.extra.scale.setScalar(0.62); g.extra.position.set(0, -0.115, 0.07); g.extra.rotation.y = Math.PI / 2; g.cabeza.add(g.extra); }
    else if (g.tipo === 'carey') { g.vaso = crearVaso(); g.vaso.visible = false; grupo.add(g.vaso); }
    g.enc = encs.find(e => e.gato === g.tipo) || null;
    if (g.extra) g.extra.visible = !!(g.enc && g.enc.estado === 'entregado');
    g.meta = { tipo: 'gato', id: 'gato_' + g.tipo, gato: g.tipo, enc: g.enc, p: new THREE.Vector3(), fp: new THREE.Vector3() };
    g.metaC = { tipo: 'caricia', id: 'caricia_' + g.tipo, gato: g.tipo, enc: g.enc, p: new THREE.Vector3(), fp: new THREE.Vector3() };
    g.calma = 0;
    g.aros = crearAros();
  });
  // Ajustes en vivo de los encargos (Tweaks): señal, destello, alcance, quién te busca y cada cuánto maúlla
  const CFG = { aros: true, destello: true, alcance: 8, vienen: 'json', miau: 30 };
  const viene = g => CFG.vienen === 'todos' ? true : CFG.vienen === 'ninguno' ? false : !!(g.enc && g.enc.viene);
  const ansioso = g => !!g.enc && g.enc.estado === 'llevas';     // llevas su objeto: no huye y maúlla más; si "viene", te busca
  const amigo = g => !!g.enc && g.enc.estado === 'entregado';    // ya lo recibió: deja que te acerques
  const BEBE = 9;

  function bfs(sx, sy, bloq = -1) {
    const dist = new Int16Array(W * H).fill(-1), prev = new Int32Array(W * H).fill(-1), qq = [sy * W + sx]; dist[qq[0]] = 0;
    for (let h = 0; h < qq.length; h++) {
      const i = qq[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || solido(nx, ny) || dist[j] >= 0 || j === bloq) continue; dist[j] = dist[i] + 1; prev[j] = i; qq.push(j); }
    }
    return { dist, prev };
  }
  const caminoA = (prev, j) => { const out = []; for (let k = j; k >= 0; k = prev[k]) out.push(k); return out.reverse(); };
  function rutaA(g, celdas, vel, huye) {
    g.ruta = celdas.map(j => [((j % W) + .5) * C + (R() - .5) * 0.5, (((j / W) | 0) + .5) * C + (R() - .5) * 0.5]);
    g.velT = vel; g.huye = huye; g.estado = 'camina';
  }
  function aparecer(g, c, mirarAlJugador) {
    const [cx, cz] = centro(c); Object.assign(g, { x: cx + (R() - .5) * 0.6, z: cz + (R() - .5) * 0.6, s: 1, v: 0, velT: 0, estado: 'sentado', ruta: [], huye: false, esfuma: 0, tSent: 3 + R() * 7, notado: false });
    g.head = mirarAlJugador ? Math.atan2(P.x - g.x, P.z - g.z) : R() * 6.28;
    g.obj.visible = true; g.obj.scale.setScalar(1);
  }
  function desaparecer(g) { g.estado = 'oculto'; g.obj.visible = false; g.tOc = 12 + R() * 20; }
  function sentar(g) { g.estado = 'sentado'; g.velT = 0; g.huye = false; g.tSent = 4 + R() * 8; }
  function huir(g) {
    const [gx, gy] = celda(g.x, g.z), [px, py] = celda(P.x, P.z);
    const dp = bfs(px, py).dist, { dist, prev } = bfs(gx, gy, py * W + px);
    let best = -1, bs = -1e9;
    for (let j = 0; j < W * H; j++) { const dc = dist[j]; if (dc < 3 || dc > 10) continue; const sc = dp[j] - dc * 0.25 + R() * 1.5; if (sc > bs) { bs = sc; best = j; } }
    if (best < 0) for (let j = 0; j < W * H; j++) if (dist[j] > 0 && (best < 0 || dist[j] > dist[best])) best = j;
    if (best < 0) { g.esfuma = 0.001; return; }                  // acorralado: se esfuma
    rutaA(g, caminoA(prev, best).slice(1), 2.7, true);
  }
  // Recorre el laberinto por su cuenta: elige un pasillo a 5–14 celdas, sin pasar por la celda del jugador
  function pasear(g) {
    const [gx, gy] = celda(g.x, g.z), [px, py] = celda(P.x, P.z), { dist, prev } = bfs(gx, gy, py * W + px), ops = [];
    for (let j = 0; j < W * H; j++) if (dist[j] >= 5 && dist[j] <= 14) ops.push(j);
    if (!ops.length) for (let j = 0; j < W * H; j++) if (dist[j] >= 2) ops.push(j);
    if (!ops.length) { g.tSent = 4; return; }
    rutaA(g, caminoA(prev, ops[Math.floor(R() * ops.length)]).slice(1), 0.8 + R() * 0.2, false);
  }
  function miau(g, d, alc = 14) {
    if (!sfx || !sfx.miau) return; g.tMiau = T0 + 10;
    sfx.miau(Math.pow(clamp(1 - d / alc, 0, 1), 1.3) * (g.ve ? 1 : 0.55), g.tono, panDe(g.x, g.z));
  }
  function acercarse(g) {
    const [gx, gy] = celda(g.x, g.z), [px, py] = celda(P.x, P.z); g.tRuta = 1.2;
    if (gx === px && gy === py) { g.ruta = [[P.x, P.z]]; g.velT = 1.05; g.huye = false; g.estado = 'camina'; return; }
    const { dist, prev } = bfs(gx, gy), j = py * W + px; if (dist[j] < 0) return;
    rutaA(g, caminoA(prev, j).slice(1), 1.05, false);
    if (g.ruta.length) g.ruta[g.ruta.length - 1] = [P.x, P.z];
  }
  function beber(g, dt, T) {
    g.bebe -= dt; const lv = clamp(g.bebe / BEBE, 0.06, 1);
    g.vaso.userData.leche.scale.set(0.88 + 0.12 * lv, 0.096 * lv, 0.88 + 0.12 * lv);
    g.cabY += (0 - g.cabY) * (1 - Math.exp(-5 * dt)); g.cabP += (0.85 + Math.sin(T * 11) * 0.09 - g.cabP) * (1 - Math.exp(-9 * dt));
    if (g.bebe <= 0) { g.bebe = 0; g.tSent = 8; if (sfx && sfx.ronroneo) sfx.ronroneo(0.8, panDe(g.x, g.z)); }
  }
  // Reparto inicial: lejos del jugador, fuera de su vista y separados entre sí
  gatos.forEach((g, i) => {
    let c = null;
    for (let k = 0; k < 40 && !c; k++) {
      const cand = buscarPiso(8, 60, { vista: false });
      if (cand && gatos.slice(0, i).every(o => Math.hypot(centro(cand)[0] - o.x, centro(cand)[1] - o.z) > 8)) c = cand;
    }
    if (c) aparecer(g, c); else g.tOc = 2 + i;
  });

  // Pose: sentado (s) y acostado (ac, para la vigilia frente a la tumba) se mezclan sobre la pose de caminar
  function posar(g, dt, T) {
    const ac = g.ac, L = (a, b) => a + (b - a) * ac;
    const s = g.s, p = 0.8 * s * (1 - ac), mov = clamp(g.v / 1.6, 0, 1.4), sw = Math.sin(g.fase) * 0.6 * Math.min(1, mov);
    const hipY = L(0.2 - 0.125 * s + Math.abs(Math.cos(g.fase)) * 0.012 * Math.min(1, mov), 0.08);
    g.cuerpo.position.set(0, hipY, -0.1); g.cuerpo.rotation.x = -p;
    const cp = Math.cos(p), sp = Math.sin(p), hy = hipY - 0.02 * cp + 0.26 * sp, ty = hipY - 0.01 * cp + 0.02 * sp;
    g.del.forEach((Lg, k) => { const l = L(hy - 0.012, 0.11); Lg.p.rotation.x = L(p + (k ? sw : -sw) * (1 - s), -1.3); Lg.l.scale.y = l; Lg.pie.position.y = -l; });
    g.tra.forEach((Lg, k) => { const l = L((ty - 0.012) * (1 - s) + 0.13 * s, 0.06); Lg.p.rotation.x = L(p + (k ? -sw : sw) * (1 - s) - 1.32 * s, 1.35); Lg.l.scale.y = l; Lg.pie.position.y = -l; });
    g.cuello.rotation.set(p * 0.95 + g.cabP, g.cabY, 0);
    const alerta = g.notado ? 1 : 0, amp = reducido ? 0.5 : 1;
    g.cola[0].rotation.set(L(2.25 * (1 - s) + 1.4 * s + p, 1.62), L(Math.sin(T * (1.3 + alerta) + g.ph) * (0.18 + 0.25 * alerta) * s * amp, 0.55 + Math.sin(T * 0.9 + g.ph) * 0.06 * amp), 0);
    for (let i = 1; i < 6; i++) {
      const c = g.cola[i];
      c.rotation.x = L((1 - s) * (i > 3 ? -0.35 : 0.05) + s * 0.12, 0.02);
      c.rotation.z = L(Math.sin(T * (1.8 + alerta * 2) + g.ph - i * 0.6) * (0.08 + 0.1 * alerta + 0.06 * (1 - s)) * amp + s * 0.32, 0.3 + Math.sin(T * 1.2 + g.ph - i * 0.5) * 0.04 * amp);
    }
    if (g.tic <= 0 && R() < dt * 0.3) g.tic = 0.2; g.tic -= dt;
    g.orejas.forEach((o, k) => { o.rotation.z = o.userData.base + (g.tic > 0 && k === 0 ? Math.sin(g.tic * 60) * 0.25 : 0); });
    if (g.parp <= 0 && R() < dt * 0.35) g.parp = 0.14; g.parp -= dt;
    g.ojos.forEach(o => { o.o.scale.y = 0.011 * (g.parp > 0 ? 0.15 : 1); });
    g.obj.position.set(g.x, 0, g.z); g.obj.rotation.y = g.head;
  }

  // ---------- Final: los tres gatos con lo suyo velan una tumba; el último en recibir guía al jugador ----------
  const FIN = { activo: false, acostando: false, tFin: 0 };
  const mirarCab = (g, dt, yaw, pitch, k = 4) => { g.cabY += (yaw - g.cabY) * (1 - Math.exp(-k * dt)); g.cabP += (pitch - g.cabP) * (1 - Math.exp(-k * dt)); };
  function rutaHasta(g, sp) {
    const [gx, gy] = celda(g.x, g.z), [sx, sy] = celda(sp[0], sp[1]), { dist, prev } = bfs(gx, gy), j = sy * W + sx;
    g.ruta = dist[j] < 0 ? [] : caminoA(prev, j).slice(1).map(k => [((k % W) + .5) * C, (((k / W) | 0) + .5) * C]);
    if (g.ruta.length) g.ruta[g.ruta.length - 1] = [sp[0], sp[1]]; else g.ruta = [[sp[0], sp[1]]];
  }
  function moverRuta(g, dt) {         // true al llegar al final de la ruta
    const w = g.ruta[0]; if (!w) return true;
    const wx = w[0] - g.x, wz = w[1] - g.z;
    if (Math.hypot(wx, wz) < 0.15) { g.ruta.shift(); return !g.ruta.length; }
    const df = angDif(Math.atan2(wx, wz), g.head); g.head += clamp(df, -8 * dt, 8 * dt);
    const av = g.v * dt * (1 - g.s) * (Math.abs(df) > 1.2 ? 0.3 : 1), nx = g.x + Math.sin(g.head) * av, nz = g.z + Math.cos(g.head) * av;
    if (!solido(Math.floor(nx / C), Math.floor(nz / C))) { g.x = nx; g.z = nz; } else g.head += df;
    return false;
  }
  function colocarEnTumba(g, acostado) {
    const [x, z] = g.spot; Object.assign(g, { x, z, head: tumba.face, estado: 'sentado', s: 1, v: 0, velT: 0, ruta: [], esfuma: 0, final: acostado ? 'acostado' : 'espera' });
    if (acostado) { g.acT = g.ac = 1; g.tAc = 0; }
    g.obj.visible = true; g.obj.scale.setScalar(1);
  }
  function iniciarFinal(tipoGuia, demora = 3.2) {
    if (!tumba || FIN.activo) return; FIN.activo = true; FIN.acostando = false;
    const guia = gatos.find(g => g.tipo === tipoGuia) || gatos[0], otros = gatos.filter(g => g !== guia);
    [otros[0], guia, otros[1]].forEach((g, i) => { if (g) { g.spot = tumba.spots[i]; g.ruta = []; g.huye = false; } });
    otros.forEach(g => { g.final = 'ir'; if (g.estado === 'oculto') colocarEnTumba(g); });
    Object.assign(guia, { final: 'guia', tGuia: demora, espera: false, tLlamar: 0 });
    if (guia.estado === 'oculto') aparecer(guia, celda(P.x, P.z), true);
  }
  function finalInmediato() {   // al recargar con los tres encargos entregados: ya están acostados frente a la tumba
    if (!tumba) return; FIN.activo = FIN.acostando = true; FIN.tFin = 0.01; FIN.silencio = true;
    gatos.forEach((g, i) => { g.spot = tumba.spots[[1, 0, 2][i] ?? 1]; colocarEnTumba(g, true); });
  }
  function acostarTodos() {
    FIN.acostando = true; FIN.tFin = 3.4; FIN.silencio = false;
    const guia = gatos.find(g => g.spot === tumba.spots[1]);
    gatos.filter(g => g !== guia).concat(guia ? [guia] : []).forEach((g, i) => { g.final = 'acostado'; g.tAc = 0.3 + i * 0.6; });
  }
  function final(g, dt, T, d) {
    const alJugador = () => { const rel = angDif(Math.atan2(P.x - g.x, P.z - g.z), g.head); if (Math.abs(rel) > 1.1) g.head += Math.sign(rel) * 1.2 * dt; mirarCab(g, dt, clamp(rel, -1.1, 1.1), -0.22); };
    const quieto = () => { g.estado = 'sentado'; g.velT = 0; };
    if (g.final === 'ir') {
      const sp = g.spot, veSpot = Math.hypot(P.x - sp[0], P.z - sp[1]) < 12 && linea(P.x, P.z, sp[0], sp[1]);
      if (!g.ve && !veSpot) { colocarEnTumba(g); return; }       // nadie la ve: ya está allá
      if (!g.ruta.length) rutaHasta(g, sp);
      g.estado = 'camina'; g.velT = 1.4; mirarCab(g, dt, 0, 0.05, 6);
      if (moverRuta(g, dt)) { quieto(); g.final = 'espera'; }
    } else if (g.final === 'guia') {
      if (g.bebe > 0) { quieto(); beber(g, dt, T); return; }
      if (g.tGuia > 0) {
        quieto(); alJugador(); g.tGuia -= dt;
        if (g.tGuia <= 0) { rutaHasta(g, g.spot); alEvento('sigueme'); if (sfx && sfx.miau) sfx.miau(0.8, g.tono, panDe(g.x, g.z)); }
        return;
      }
      if (!g.espera && d > 5.5) g.espera = true; else if (g.espera && d < 3.6) g.espera = false;
      if (g.espera) { quieto(); alJugador(); if ((g.tLlamar -= dt) <= 0) { g.tLlamar = 4 + R() * 2; if (d < 13) miau(g, d); } }
      else { g.estado = 'camina'; g.velT = 1.1; mirarCab(g, dt, 0, 0.05, 6); if (moverRuta(g, dt)) { quieto(); g.final = 'espera'; } }
    } else {
      quieto(); g.head += clamp(angDif(tumba.face, g.head), -2.5 * dt, 2.5 * dt);
      mirarCab(g, dt, 0, g.final === 'acostado' ? -0.12 : -0.18, 3);
      if (g.final === 'espera' && !FIN.acostando && gatos.every(o => o.final === 'espera')) acostarTodos();
      if (g.final === 'acostado' && g.tAc > 0 && (g.tAc -= dt) <= 0) g.acT = 1;
    }
  }

  let T0 = 0;
  if (tumba && encs.length && encs.every(e => e.estado === 'entregado')) finalInmediato();
  function actualizarGato(g, dt, T) {
    if (g.estado === 'oculto') {
      g.tOc -= dt;
      if (g.tOc <= 0) { const c = ansioso(g) && viene(g) ? buscarPiso(5, 16, { vista: false }) : buscarPiso(9, 40, { vista: false }); if (c) aparecer(g, c); else g.tOc = 3; }
      return;
    }
    if (g.esfuma > 0) {
      g.esfuma += dt; g.obj.scale.setScalar(Math.max(0.001, 1 - g.esfuma / 0.3));
      if (g.esfuma > 0.3) { g.esfuma = 0; desaparecer(g); }
      return;
    }
    const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz);
    if (g.calma > 0) g.calma -= dt;
    if ((g.veT -= dt) <= 0) { g.veT = 0.2; g.ve = linea(P.x, P.z, g.x, g.z); }
    const acerca = d > 0.01 && (P.vx * -dx + P.vz * -dz) / d > 1.2;
    if (g.ve && d < 8) { if (!g.notado) { g.notado = true; if (T > g.tMiau && R() < 0.6) miau(g, d); } }
    else if (!g.ve || d > 10) g.notado = false;
    if (T > g.tAmb) { const a = ansioso(g); g.tAmb = T + (a ? CFG.miau + R() * 20 : 30 + R() * 45); if (d < 13) miau(g, d); }

    if (g.final) final(g, dt, T, d);
    else if (g.estado === 'sentado') {
      g.tSent -= dt;
      if (ansioso(g)) {
        if (!viene(g)) { if (g.tSent <= 0) pasear(g); }      // espera a que llegues: ni huye ni se acerca
        else if (d > 1.9 && d < 13) { if ((g.tRuta -= dt) <= 0) acercarse(g); } else if (d >= 13 && g.tSent <= 0) pasear(g);
      }
      else if (g.bebe > 0) { /* quieta mientras bebe */ }
      else if (g.tSent <= 0) pasear(g);
      if (g.bebe > 0) beber(g, dt, T);
      else if (g.notado) {
        const rel = angDif(Math.atan2(dx, dz), g.head);
        if (Math.abs(rel) > 1.1) g.head += Math.sign(rel) * 0.8 * dt;
        g.cabY += (clamp(rel, -1.1, 1.1) - g.cabY) * (1 - Math.exp(-5 * dt)); g.cabP += (-0.22 - g.cabP) * (1 - Math.exp(-4 * dt));
      } else {
        g.cabY += (Math.sin(T * 0.25 + g.ph) * 0.7 - g.cabY) * (1 - Math.exp(-2 * dt)); g.cabP += (0.08 - g.cabP) * (1 - Math.exp(-2 * dt));
      }
    } else if (g.estado === 'camina') {
      if (ansioso(g)) {
        if (!viene(g)) { if (g.ve && d < 2.4) g.ruta = []; }              // se detiene si llegas a su lado
        else if (d < 1.25) { g.ruta = []; g.tRuta = 0.6; } else if (d < 13 && (g.tRuta -= dt) <= 0) acercarse(g);
      }
      const w = g.ruta[0];
      if (!w) sentar(g);
      else {
        const wx = w[0] - g.x, wz = w[1] - g.z;
        if (Math.hypot(wx, wz) < 0.18) g.ruta.shift();
        else {
          const df = angDif(Math.atan2(wx, wz), g.head); g.head += clamp(df, -8 * dt, 8 * dt);
          const av = g.v * dt * (1 - g.s) * (Math.abs(df) > 1.2 ? 0.3 : 1), nx = g.x + Math.sin(g.head) * av, nz = g.z + Math.cos(g.head) * av;
          if (!solido(Math.floor(nx / C), Math.floor(nz / C))) { g.x = nx; g.z = nz; } else g.head += df;
        }
      }
      g.cabY += (0 - g.cabY) * (1 - Math.exp(-6 * dt)); g.cabP += (0.05 - g.cabP) * (1 - Math.exp(-6 * dt));
      if (g.huye && d > 7 && !g.ve && R() < dt * 0.4) desaparecer(g);
    }
    g.v += (g.velT - g.v) * (1 - Math.exp(-6 * dt)); g.fase += g.v * dt * 7.5;
    g.ac += (g.acT - g.ac) * (1 - Math.exp(-2.2 * dt));
    g.s += ((g.estado === 'sentado' ? 1 : 0) - g.s) * (1 - Math.exp(-5 * dt));
    posar(g, dt, T);
    // Brillo de ojos (tapetum): solo si la linterna lo alcanza y el gato mira hacia la cámara
    g.cabeza.getWorldPosition(tv); cam.getWorldDirection(fw);
    const ex = tv.x - cam.position.x, ey = tv.y - cam.position.y, ez = tv.z - cam.position.z, de = Math.hypot(ex, ey, ez) || 1;
    const cosA = (ex * fw.x + ey * fw.y + ez * fw.z) / de, hf = g.head + g.cabY, mira = (Math.sin(hf) * -ex + Math.cos(hf) * -ez) / (Math.hypot(ex, ez) || 1);
    const k = g.ve && de < 15 ? sstep(0.88, 0.97, cosA) * (1 - sstep(8, 15, de)) * sstep(0.2, 0.6, mira) : 0;
    g.brillo += (k - g.brillo) * (1 - Math.exp(-12 * dt));
    g.ojos.forEach(o => o.mat.color.copy(o.base).multiplyScalar(0.3).lerp(o.brillo, g.brillo));
  }

  // ---------- Bucle ----------
  function update(dt, T) {
    T0 = T; uT.value = T;
    capas.forEach(m => { const mp = m.material.alphaMap; mp.offset.x += m.userData.v[0] * dt; mp.offset.y += m.userData.v[1] * dt; });
    jirones.forEach(j => {
      j.t += dt; if (j.t > j.vida) { reubicarJiron(j); return; }
      const p = j.m.position, nx = p.x + j.vx * dt, nz = p.z + j.vz * dt;
      if (solido(Math.floor(nx / C), Math.floor(nz / C))) { j.vx = -j.vx; j.vz = -j.vz; } else { p.x = nx; p.z = nz; }
      const d = Math.hypot(cam.position.x - p.x, cam.position.z - p.z);
      j.m.material.opacity = j.op * sstep(0, 3, j.t) * (1 - sstep(j.vida - 3, j.vida, j.t)) * sstep(0.5, 2.4, d);
      j.m.rotation.y = Math.atan2(cam.position.x - p.x, cam.position.z - p.z);
    });
    fuegos.forEach((f, i) => {
      f.t += dt; if (f.t > f.vida) reubicarFuego(f);
      if (!f.huye && Math.hypot(P.x - f.x, P.z - f.z) < 3.2) f.huye = 0.001;
      if (f.huye) { f.huye += dt; f.y += dt * 0.7; if (f.huye > 1) reubicarFuego(f); }
      const fade = sstep(0, 1.5, f.t) * (1 - sstep(f.vida - 1.5, f.vida, f.t)) * (f.huye ? 1 - sstep(0, 0.8, f.huye) : 1);
      const b = fade * (0.65 + 0.35 * Math.sin(T * 3.1 + f.ph));
      fPos[i * 3] = f.x + Math.sin(T * 0.37 + f.ph) * 0.45; fPos[i * 3 + 1] = f.y + Math.sin(T * 0.9 + f.ph * 1.3) * 0.12; fPos[i * 3 + 2] = f.z + Math.cos(T * 0.29 + f.ph) * 0.45;
      fCol[i * 3] = CF.r * b; fCol[i * 3 + 1] = CF.g * b; fCol[i * 3 + 2] = CF.b * b;
    });
    fGeo.attributes.position.needsUpdate = true; fGeo.attributes.color.needsUpdate = true;
    if ((ojosT -= dt) <= 0) { ojosT = 3 + R() * 5; const libre = pares.find(p => !p.activo); if (libre && R() < 0.6) colocarOjos(libre); }
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    pares.forEach(p => {
      if (!p.activo) return;
      p.t += dt; const dx = p.g.position.x - P.x, dz = p.g.position.z - P.z, d = Math.hypot(dx, dz), directo = (dx * fx + dz * fz) / (d || 1) > 0.992 && d < 11;
      if (!p.sale && (d < 4.5 || p.t > p.vida || directo)) p.sale = 0.001;
      if (p.parp <= 0 && R() < dt * 0.5) p.parp = 0.14; p.parp -= dt;
      let sy = p.parp > 0 ? 0.12 : 1, op = sstep(0, 0.5, p.t);
      if (p.sale) { p.sale += dt; op *= 1 - sstep(0, 0.25, p.sale); sy = Math.min(sy, Math.max(0.05, 1 - p.sale * 4)); if (p.sale > 0.3) { p.activo = false; p.g.visible = false; } }
      p.mat.opacity = op; p.a.scale.set(p.r, p.r * sy, p.r); p.b.scale.set(p.r, p.r * sy, p.r);
    });
    if (!ap.activa) { if ((ap.prox -= dt) <= 0 && !intentarAparicion()) ap.prox = 4; }
    else {
      ap.t += dt; const d = Math.hypot(fant.position.x - P.x, fant.position.z - P.z);
      if (!ap.sale && (d < 6 || ap.t > ap.vida)) ap.sale = 0.001;
      let op = sstep(0, 0.9, ap.t) * 0.24 * (0.85 + 0.15 * Math.sin(T * 9)) * (1 - sstep(10, 18, d) * 0.6);
      if (ap.sale) { ap.sale += dt; op *= 1 - sstep(0, d < 6 ? 0.35 : 1.2, ap.sale); if (ap.sale > (d < 6 ? 0.4 : 1.25)) { ap.activa = false; fant.visible = false; ap.prox = 45 + R() * 50; } }
      fantMat.opacity = op; fant.position.y = 0.03 * Math.sin(T * 1.3);
      fant.rotation.y = Math.atan2(cam.position.x - fant.position.x, cam.position.z - fant.position.z);
    }
    gatos.forEach(g => actualizarGato(g, dt, T));
    if (FIN.tFin > 0 && (FIN.tFin -= dt) <= 0) alEvento(FIN.silencio ? 'acostadosYa' : 'acostados');   // ya: al recargar, sin rayo
    cam.getWorldDirection(fw);
    encs.forEach(e => {
      if (e.saca > 0) {
        e.saca += dt; e.obj.scale.setScalar(Math.max(0.001, 1 - sstep(0, 0.3, e.saca))); e.obj.position.y = e.y0 + e.saca * 0.5;
        if (e.saca > 0.3) { e.saca = 0; e.obj.visible = e.glint.visible = false; }
      }
      if (e.estado !== 'escondido' || e.saca) { pintarAros(e.aros, 0, 0, 0, 0, T); if (e.estado !== 'escondido') return; }
      // Aros en el suelo cuando está cerca y a la vista
      const dP = Math.hypot(e.x - P.x, e.z - P.z);
      if ((e.cercaT -= dt) <= 0) { e.cercaT = 0.3; e.cerca = dP < CFG.alcance && linea(P.x, P.z, e.x, e.z); }
      if (!e.saca) pintarAros(e.aros, e.x, e.z, CFG.aros && e.cerca ? 1 - sstep(CFG.alcance * 0.56, CFG.alcance, dP) : 0, e.ph, T);
      // Destello: solo cuando la linterna lo alcanza de frente y hay línea de vista
      const ex = e.x - cam.position.x, ey = e.gy - cam.position.y, ez = e.z - cam.position.z, de = Math.hypot(ex, ey, ez) || 1;
      const cosA = (ex * fw.x + ey * fw.y + ez * fw.z) / de; let k = 0;
      if (de < 10 && cosA > 0.93) { if ((e.veT -= dt) <= 0) { e.veT = 0.25; e.ve = linea(P.x, P.z, e.x, e.z); } if (e.ve) k = sstep(0.93, 0.985, cosA) * (1 - sstep(6, 10, de)); }
      const tw = Math.pow(Math.max(0, Math.sin(T * 1.7 + e.ph)), 14);
      e.glint.material.opacity = CFG.destello ? k * tw * 0.9 : 0; e.glint.scale.setScalar(0.12 + tw * 0.16);
    });
    gatos.forEach(g => {
      const ka = CFG.aros && ansioso(g) && g.estado !== 'oculto' && !g.esfuma && g.ve ? 1 - sstep(CFG.alcance * 0.56, CFG.alcance * 1.1, Math.hypot(g.x - P.x, g.z - P.z)) : 0;
      pintarAros(g.aros, g.x, g.z, ka, g.ph, T, 1.5);
      if (!(g.pop > 0)) return;
      g.pop += dt; const u = Math.min(1, g.pop / 0.4), k = 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);
      g.popObj.scale.setScalar(Math.max(0.001, g.popS * k)); if (u >= 1) g.pop = 0;
    });
  }

  // ---------- Encargos: objetivos dinámicos, recoger y entregar ----------
  const lista = [];
  function objetivos() {
    lista.length = 0;
    encs.forEach(e => { if (e.estado === 'escondido' && !e.saca) lista.push(e); });
    gatos.forEach(g => {
      if (g.estado === 'oculto' || g.esfuma > 0) return;
      const m = ansioso(g) ? g.meta : g.metaC;     // con su objeto: darlo; si no: acariciarlo
      g.cabeza.getWorldPosition(m.p); m.fp.set(g.x, 0, g.z); lista.push(m);
    });
    return lista;
  }
  function recoger(id) {
    const e = encs.find(x => x.id === id); if (!e || e.estado !== 'escondido') return;
    e.estado = 'llevas'; e.saca = 0.001;
    const g = gatos.find(x => x.tipo === e.gato); if (!g) return;
    g.tAmb = T0 + 2.5 + R() * 2; g.tRuta = 0;
    if (g.estado === 'oculto') g.tOc = Math.min(g.tOc, 2.5); else if (g.huye) g.ruta = [];
  }
  function entregar(id) {
    const e = encs.find(x => x.id === id); if (!e || e.estado !== 'llevas') return;
    e.estado = 'entregado';
    const g = gatos.find(x => x.tipo === e.gato); if (!g) return;
    g.ruta = []; sentar(g); g.tSent = 16; g.head = Math.atan2(P.x - g.x, P.z - g.z); g.cabY = 0;
    g.popObj = g.extra || g.vaso; g.pop = 0.001; if (g.popObj) { g.popObj.visible = true; g.popObj.scale.setScalar(0.001); }
    if (g.vaso) {
      g.vaso.position.set(g.x + Math.sin(g.head) * 0.24, 0, g.z + Math.cos(g.head) * 0.24);
      g.vaso.userData.leche.scale.set(1, 0.096, 1); g.bebe = BEBE;
    }
    if (sfx && sfx.ronroneo) sfx.ronroneo(1, panDe(g.x, g.z));
    if (sfx && sfx.miau) setTimeout(() => sfx.miau(0.7, g.tono * 1.12, panDe(g.x, g.z)), 900);
  }
  function acariciar(tipo) {
    const g = gatos.find(x => x.tipo === tipo); if (!g || g.estado === 'oculto') return;
    if (g.final) { g.parp = 0.9; if (sfx && sfx.ronroneo) sfx.ronroneo(0.9, panDe(g.x, g.z)); return; }   // en la vigilia no se mueve
    if (g.estado === 'camina') { g.ruta = []; sentar(g); }
    g.tSent = Math.max(g.tSent, 10); g.calma = 10; g.huye = false; g.parp = 0.9;   // cierra los ojos un momento
    if (!(g.bebe > 0)) g.head = Math.atan2(P.x - g.x, P.z - g.z);
    if (sfx && sfx.ronroneo) sfx.ronroneo(0.9, panDe(g.x, g.z));
  }
  function resetEncargos() {
    encs.forEach(e => { e.estado = 'escondido'; e.saca = 0; e.obj.visible = e.glint.visible = true; e.obj.scale.setScalar(1); e.obj.position.y = e.y0; });
    gatos.forEach(g => { g.bebe = 0; g.pop = 0; if (g.extra) g.extra.visible = false; if (g.vaso) g.vaso.visible = false; g.final = null; g.spot = null; g.acT = 0; g.ruta = []; });
    if (FIN.activo) { FIN.activo = FIN.acostando = false; FIN.tFin = 0; alEvento('reset'); }
    encs.forEach(e => { e.cercaT = 0; });
  }

  // Pruebas: traer los gatos frente al jugador, forzar ojos o la aparición
  function traerGatos() {
    // En fila frente al jugador, a ~3,2 m; si hay muro, en el punto libre más lejano de esa línea
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fx;
    let dist = 3.2; while (dist > 1.2 && solido(Math.floor((P.x + fx * dist) / C), Math.floor((P.z + fz * dist) / C))) dist -= 0.2;
    gatos.forEach((g, i) => {
      let x = P.x + fx * dist + rx * (i - 1) * 0.55, z = P.z + fz * dist + rz * (i - 1) * 0.55;
      if (solido(Math.floor(x / C), Math.floor(z / C))) { x = P.x + fx * dist; z = P.z + fz * dist + 0.01 * i; }
      aparecer(g, celda(x, z), true); g.x = x; g.z = z; g.head = Math.atan2(P.x - x, P.z - z); g.tSent = 30;
    });
  }
  return {
    grupo, update, gatos, encargos: encs, objetivos, recoger, entregar, acariciar, resetEncargos, iniciarFinal,
    ajustarEncargos(c = {}) { Object.assign(CFG, c); encs.forEach(e => { e.cercaT = 0; }); gatos.forEach(g => { if (ansioso(g)) g.tAmb = Math.min(g.tAmb, T0 + CFG.miau); }); return { ...CFG }; },
    // Pruebas: entrega todo y arranca el final con el gato más cercano, traído frente al jugador
    forzarFinal() {
      if (!tumba) return [];
      encs.forEach(e => { if (e.estado !== 'entregado') { e.estado = 'entregado'; e.saca = 0; e.obj.visible = e.glint.visible = false; pintarAros(e.aros, 0, 0, 0, 0, 0); } });
      gatos.forEach(g => { if (g.extra) { g.extra.visible = true; g.extra.scale.setScalar(g.popS); } g.final = null; g.acT = 0; });
      const guia = gatos.slice().sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let dd = 2.2; while (dd > 0.8 && solido(Math.floor((P.x + fx * dd) / C), Math.floor((P.z + fz * dd) / C))) dd -= 0.2;
      aparecer(guia, celda(P.x + fx * dd, P.z + fz * dd), true); guia.x = P.x + fx * dd; guia.z = P.z + fz * dd; guia.head = Math.atan2(P.x - guia.x, P.z - guia.z);
      FIN.activo = false; iniciarFinal(guia.tipo, 1.2);
      return encs.map(e => e.id);
    },
    // Copia del objeto para mostrarlo aparte (pantalla de hallazgo); comparte geometrías y materiales
    modelo(id) { const e = encs.find(x => x.id === id); return !e ? new THREE.Group() : e.gato === 'van' ? crearConejo() : e.gato === 'carey' ? crearVaso() : crearChaleco(0.113, 0.108, 0.214); },
    forzar(cosa) {
      if (cosa === 'gatos') traerGatos();
      else if (cosa === 'ojos') { const p = pares.find(x => !x.activo) || pares[0]; colocarOjos(p, true); }
      else if (cosa === 'aparicion') { ap.activa = false; fant.visible = false; intentarAparicion(true); }
    },
    dispose() { hierba.dispose(); hiedra.dispose(); lib.forEach(o => o.dispose()); scene.remove(grupo); },
  };
}
