// Cartas de tarot: repartidas por el cementerio (en lugar de las velas); ya recogidas se colocan en la mesa del Mausoleo.
// mapa.json → "cartas": [{ id, nombre, sentido, arcano, palo + n | mayor, invertida?, lugar, celda?, imagen? }]
// lugar: "suelo", "borde" o "mausoleo", con la misma regla que tenían las velas (lo más lejos posible de lo demás).
// La cara se pinta en canvas. Con "imagen" (ruta relativa a laberinto/) se usa esa ilustración dentro del marco.
import * as THREE from '../vendor/three.module.min.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const CARTA_W = 0.14, CARTA_H = 0.24;
const CW = 280, CH = 480, TINTA = '#2a1d14', VINO = '#7a2a22', ORO = '#b08a48', PAPEL = '#e6d9bc';
const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ---------- Cara y dorso (canvas, se comparten entre el laberinto y el Mausoleo) ----------
export function lineas(g, txt, ancho) {
  const out = [];
  String(txt).split(' / ').forEach(parte => {
    let cur = ''; parte.split(' ').forEach(p => { const t = cur ? cur + ' ' + p : p; if (g.measureText(t).width > ancho && cur) { out.push(cur); cur = p; } else cur = t; });
    if (cur) out.push(cur);
  });
  return out;
}
const PIP = {
  espadas(g, k) {
    g.scale(k, k); g.fillStyle = TINTA;
    g.beginPath(); g.moveTo(0, -34); g.lineTo(4, -26); g.lineTo(4, 16); g.lineTo(-4, 16); g.lineTo(-4, -26); g.closePath(); g.fill();
    g.fillStyle = VINO; g.fillRect(-13, 16, 26, 4);
    g.fillStyle = TINTA; g.fillRect(-2.5, 20, 5, 11); g.beginPath(); g.arc(0, 34, 4, 0, 6.29); g.fill();
  },
  copas(g, k) {
    g.scale(k, k); g.fillStyle = TINTA;
    g.beginPath(); g.moveTo(-18, -22); g.lineTo(18, -22); g.quadraticCurveTo(18, 6, 0, 8); g.quadraticCurveTo(-18, 6, -18, -22); g.fill();
    g.fillStyle = ORO; g.fillRect(-18, -22, 36, 3);
    g.fillStyle = TINTA; g.fillRect(-2.5, 8, 5, 12); g.beginPath(); g.ellipse(0, 22, 12, 4, 0, 0, 6.29); g.fill();
  },
  pentaculos(g, k) {
    g.scale(k, k); g.fillStyle = ORO; g.beginPath(); g.arc(0, 0, 20, 0, 6.29); g.fill();
    g.strokeStyle = TINTA; g.lineWidth = 2.5; g.stroke();
    g.lineWidth = 1.8; g.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; i ? g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15) : g.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); }
    g.closePath(); g.stroke();
  },
};
const MAYOR = {
  luna(g) {
    g.rotate(-0.35); g.fillStyle = TINTA; g.beginPath(); g.arc(0, 0, 50, 1.075, 2 * Math.PI - 1.075, false); g.arc(22, 0, 44, -1.53, 1.53, true); g.closePath(); g.fill();
    g.rotate(0.35); g.fillStyle = ORO;
    [[44, -70, 7], [62, 34, 5], [-58, 78, 6]].forEach(([x, y, r]) => { g.beginPath(); g.moveTo(x, y - r * 1.6); g.lineTo(x + r * 0.6, y); g.lineTo(x, y + r * 1.6); g.lineTo(x - r * 0.6, y); g.closePath(); g.fill(); });
  },
  justicia(g) {
    g.fillStyle = TINTA; g.strokeStyle = TINTA;
    g.fillRect(-2.5, -54, 5, 98); g.beginPath(); g.arc(0, -58, 5, 0, 6.29); g.fill(); g.fillRect(-24, 42, 48, 6); g.fillRect(-48, -46, 96, 4);
    [-1, 1].forEach(s => {
      const x = s * 44; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, -42); g.lineTo(x - 15, -6); g.moveTo(x, -42); g.lineTo(x + 15, -6); g.stroke();
      g.fillStyle = ORO; g.beginPath(); g.moveTo(x - 19, -6); g.lineTo(x + 19, -6); g.quadraticCurveTo(x, 14, x - 19, -6); g.fill(); g.lineWidth = 1.5; g.stroke(); g.fillStyle = TINTA;
    });
  },
};
const DISPOS = {
  3: [[.5, .2], [.27, .72], [.73, .72]],
  7: [[.27, .15], [.73, .15], [.5, .325], [.27, .5], [.73, .5], [.27, .85], [.73, .85]],
  10: [[.27, .1], [.73, .1], [.5, .24], [.27, .38], [.73, .38], [.27, .62], [.73, .62], [.5, .76], [.27, .9], [.73, .9]],
};
function pintarCara(c, def, im) {
  const g = c.getContext('2d'), W = CW, H = CH;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = PAPEL; g.fillRect(0, 0, W, H);
  let s = 77; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,64,36,${r() * 0.07})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7); v.addColorStop(0, 'rgba(120,88,46,0)'); v.addColorStop(1, 'rgba(120,88,46,.3)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  g.strokeStyle = TINTA; g.lineWidth = 3; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 1.2; g.strokeRect(22, 22, W - 44, H - 44);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = TINTA; g.font = '700 30px Cinzel, Georgia, serif'; g.fillText(def.arcano || '', W / 2, 54);
  g.fillStyle = VINO; g.fillRect(W / 2 - 28, 76, 56, 2);
  const B = { x: 40, y: 92, w: W - 80, h: 290 };
  if (im) {
    const iw = im.naturalWidth, ih = im.naturalHeight, k = Math.max(B.w / iw, B.h / ih), sw = B.w / k, sh = B.h / k;
    g.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, B.x, B.y, B.w, B.h); g.strokeStyle = TINTA; g.lineWidth = 1.2; g.strokeRect(B.x, B.y, B.w, B.h);
  } else if (MAYOR[def.mayor]) { g.save(); g.translate(W / 2, B.y + B.h / 2); g.scale(1.4, 1.4); MAYOR[def.mayor](g); g.restore(); }
  else if (PIP[def.palo]) {
    const k = def.n >= 10 ? 0.6 : def.n >= 7 ? 0.78 : 1.25;
    (DISPOS[def.n] || DISPOS[3]).forEach(([u, w]) => { g.save(); g.translate(B.x + u * B.w, B.y + w * B.h); PIP[def.palo](g, k); g.restore(); });
  }
  g.fillStyle = 'rgba(122,42,34,.12)'; g.fillRect(23, 394, W - 46, 63);
  g.strokeStyle = TINTA; g.lineWidth = 1.2; g.beginPath(); g.moveTo(22, 394); g.lineTo(W - 22, 394); g.stroke();
  g.fillStyle = TINTA; g.font = '700 19px Cinzel, Georgia, serif';
  const ls = lineas(g, (def.nombre || '').toUpperCase(), W - 70).slice(0, 2);
  ls.forEach((t, i) => g.fillText(t, W / 2, 426 + (i - (ls.length - 1) / 2) * 23));
}
const caras = new Map(); let dorsoC = null;
export function caraCarta(def) {
  if (caras.has(def.id)) return caras.get(def.id);
  const c = lienzo(CW, CH); c.alCambiar = []; caras.set(def.id, c); pintarCara(c, def, null);
  if (def.imagen) { const im = new Image(); im.onload = () => { pintarCara(c, def, im); c.alCambiar.forEach(f => f()); }; im.src = new URL(def.imagen, import.meta.url).href; }
  return c;
}
export function dorsoCarta() {
  if (dorsoC) return dorsoC;
  const c = lienzo(CW, CH), g = c.getContext('2d');
  g.fillStyle = '#4a1915'; g.fillRect(0, 0, CW, CH);
  g.strokeStyle = 'rgba(176,138,72,.26)'; g.lineWidth = 1.5;
  for (let i = -CH; i < CW + CH; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + CH, CH); g.moveTo(i, CH); g.lineTo(i + CH, 0); g.stroke(); }
  g.strokeStyle = ORO; g.lineWidth = 4; g.strokeRect(14, 14, CW - 28, CH - 28); g.lineWidth = 1.5; g.strokeRect(24, 24, CW - 48, CH - 48);
  const x = CW / 2, y = CH / 2;
  g.fillStyle = '#4a1915'; g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x + 46, y); g.lineTo(x, y + 70); g.lineTo(x - 46, y); g.closePath(); g.fill(); g.lineWidth = 2.5; g.stroke();
  g.beginPath(); g.arc(x, y, 18, 0, 6.29); g.stroke(); g.fillStyle = ORO; g.beginPath(); g.arc(x, y, 5, 0, 6.29); g.fill();
  return (dorsoC = c);
}
const mats = new Map(); let matDorso = null, matCanto = null, geoCarta = null;
const texDe = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function materiales(def) {
  if (mats.has(def.id)) return mats.get(def.id);
  const cv = caraCarta(def), t = texDe(cv); cv.alCambiar.push(() => { t.needsUpdate = true; });
  matDorso = matDorso || new THREE.MeshLambertMaterial({ map: texDe(dorsoCarta()), name: 'carta_dorso' });
  matCanto = matCanto || new THREE.MeshLambertMaterial({ color: 0xd8cbb0, name: 'carta_canto' });
  const r = { cara: new THREE.MeshLambertMaterial({ map: t, name: 'carta_' + def.id }), dorso: matDorso, canto: matCanto };
  mats.set(def.id, r); return r;
}
// Carta de pie en su plano XY: cara hacia +Z, la parte de arriba hacia +Y
export function mallaCarta(def) {
  const { cara, dorso, canto } = materiales(def);
  geoCarta = geoCarta || new THREE.BoxGeometry(CARTA_W, CARTA_H, 0.003);
  const m = new THREE.Mesh(geoCarta, [canto, canto, canto, canto, cara, dorso]); m.name = 'carta_' + def.id; return m;
}

// ---------- En el cementerio: tiradas en el suelo, con aros y destello como las pistas ----------
export function crearCartas({ scene, mapa, P, linea, defs = [], huecos = [], evitar = [], estado = {}, reducido = false }) {
  const { W, H, C, at, solido } = mapa;
  const grupo = new THREE.Group(); grupo.name = 'cartas'; scene.add(grupo);
  const lib = [], keep = o => (lib.push(o), o);
  let semilla = 1307; const R = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const CFG = { aros: true, alcance: 8, destello: true };

  const usados = evitar.map(p => [p[0], p[1]]);
  const lejos = (x, z) => usados.reduce((m, [ux, uz]) => Math.min(m, Math.hypot(x - ux, z - uz)), 1e9);
  const libre = (x, z) => !solido(Math.floor(x / C), Math.floor(z / C));
  const puertas = huecos.map(h => { const fx = h[4] - h[0], fz = h[5] - h[2], n = Math.hypot(fx, fz) || 1; return [h[4] + fx / n * 0.2, h[5] + fz / n * 0.2]; }).filter(p => libre(p[0], p[1]));
  const pisos = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!solido(x, y)) pisos.push([x, y]);
  const enSuelo = ([x, y]) => [(x + .5) * C, (y + .5) * C];
  const enBorde = ([x, y]) => N4.filter(([dx, dy]) => at(x + dx, y + dy) === '#').map(([dx, dy]) => [(x + .5 + dx * 0.3) * C, (y + .5 + dy * 0.3) * C]);
  const candidatos = { mausoleo: () => puertas, borde: () => pisos.flatMap(enBorde), suelo: () => pisos.map(enSuelo) };
  function mejor(l) { let b = null, bd = -1; l.forEach(p => { const d = lejos(p[0], p[1]); if (d > bd) { bd = d; b = p; } }); return b; }
  function ubicar(def) {
    if (def.celda && !solido(def.celda[0], def.celda[1])) { const c = def.lugar === 'suelo' ? [enSuelo(def.celda)] : enBorde(def.celda); return mejor(c.length ? c : [enSuelo(def.celda)]); }
    return mejor((candidatos[def.lugar] || candidatos.suelo)()) || mejor(candidatos.borde()) || mejor(candidatos.suelo());
  }
  const orden = { mausoleo: 0, borde: 1, suelo: 2 }, pos = new Array(defs.length);
  defs.map((d, i) => i).sort((a, b) => (orden[defs[a].lugar] ?? 2) - (orden[defs[b].lugar] ?? 2)).forEach(i => { const p = ubicar(defs[i]) || [P.x, P.z]; pos[i] = p; usados.push(p); });

  const ARO = keep(new THREE.RingGeometry(0.2, 0.235, 40).rotateX(-Math.PI / 2));
  const glow = (() => { const cv = lienzo(64, 64), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)); })();
  const lista = defs.map((def, i) => {
    const [x, z] = pos[i], obj = new THREE.Group(); obj.name = 'carta_' + def.id; obj.position.set(x, 0, z); obj.rotation.y = R() * 6.28; grupo.add(obj);
    const m = mallaCarta(def); m.rotation.set(-Math.PI / 2 + (R() - .5) * 0.06, (R() - .5) * 0.06, 0); m.position.y = 0.006; obj.add(m);
    const o = { ...def, def, tipo: 'carta', obj, x, z, p: new THREE.Vector3(x, 0.05, z), fp: new THREE.Vector3(x, 0, z), estado: estado[def.id] ? 'llevas' : 'escondido', saca: 0, ph: R() * 6.28, cerca: false, cercaT: 0, ve: false, veT: 0, gy: 0.04 };
    if (o.estado !== 'escondido') obj.visible = false;
    o.aros = [0, 1].map(() => { const a = new THREE.Mesh(ARO, keep(new THREE.MeshBasicMaterial({ color: 0xf0b060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))); a.renderOrder = 5; a.visible = false; a.position.set(x, 0.016, z); grupo.add(a); return a; });
    o.glint = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    o.glint.position.set(x, o.gy, z); o.glint.renderOrder = 5; grupo.add(o.glint);
    return o;
  });
  const fw = new THREE.Vector3();
  function update(dt, T, cam) {
    if (cam) cam.getWorldDirection(fw);
    lista.forEach(o => {
      if (o.saca > 0) { o.saca += dt; o.obj.scale.setScalar(Math.max(0.001, 1 - sstep(0, 0.3, o.saca))); o.obj.position.y = o.saca * 0.5; if (o.saca > 0.3) { o.saca = 0; o.obj.visible = false; } }
      const esc = o.estado === 'escondido' && !o.saca, d = Math.hypot(o.x - P.x, o.z - P.z), [a, b] = o.aros;
      if (esc && (o.cercaT -= dt) <= 0) { o.cercaT = 0.3; o.cerca = d < CFG.alcance && linea(P.x, P.z, o.x, o.z); }
      const k = esc && CFG.aros && o.cerca ? 1 - sstep(CFG.alcance * 0.56, CFG.alcance, d) : 0, u = (T * 0.6 + o.ph) % 1;
      a.visible = b.visible = k > 0.01;
      if (a.visible) { a.material.opacity = k * 0.5; b.scale.setScalar(1 + u * (reducido ? 0.4 : 1.1)); b.material.opacity = k * 0.6 * (1 - u); }
      let kg = 0;
      if (esc && cam && CFG.destello && d < 10) {
        const ex = o.x - cam.position.x, ey = o.gy - cam.position.y, ez = o.z - cam.position.z, de = Math.hypot(ex, ey, ez) || 1, cosA = (ex * fw.x + ey * fw.y + ez * fw.z) / de;
        if (cosA > 0.93) { if ((o.veT -= dt) <= 0) { o.veT = 0.25; o.ve = linea(P.x, P.z, o.x, o.z); } if (o.ve) kg = sstep(0.93, 0.985, cosA) * (1 - sstep(6, 10, de)); }
      }
      const tw = Math.pow(Math.max(0, Math.sin(T * 1.7 + o.ph)), 14);
      o.glint.material.opacity = kg * tw * 0.9; o.glint.scale.setScalar(0.12 + tw * 0.16);
    });
  }
  function objetivos() { return lista.filter(o => o.estado === 'escondido' && !o.saca); }
  function recoger(id) { const o = lista.find(x => x.id === id); if (!o || o.estado !== 'escondido') return; o.estado = 'llevas'; o.saca = 0.001; o.aros.forEach(a => { a.visible = false; }); o.glint.material.opacity = 0; }
  function reset() { lista.forEach(o => { o.estado = 'escondido'; o.saca = 0; o.obj.visible = true; o.obj.scale.setScalar(1); o.obj.position.set(o.x, 0, o.z); o.cercaT = 0; }); }
  function modelo(id) { const o = lista.find(x => x.id === id), g = new THREE.Group(); if (!o) return g; g.add(mallaCarta(o.def)); return g; }
  return {
    grupo, lista, objetivos, update, recoger, reset, modelo, es: id => lista.some(o => o.id === id),
    ajustar(c = {}) { Object.assign(CFG, c); lista.forEach(o => { o.cercaT = 0; }); },
    dispose() { lib.forEach(o => o.dispose()); scene.remove(grupo); },
  };
}
