// Velas del cementerio: empiezan apagadas y el jugador las enciende (E). mapa.json → "velas": [{ id, lugar, celda? }]
// lugar: "suelo" (en el pasillo), "borde" (al pie de una parcela) o "mausoleo" (frente a la puerta de uno).
// Sin "celda", cada vela se coloca sola lo más lejos posible de todo lo interactuable (lápidas, puerta, reja,
// encargos, inicio y las otras velas). Con "celda" se respeta esa celda.
// La luz es casi toda falsa (llama emisiva + halo + charco de luz); solo un pool fijo y pequeño de PointLight.
import * as THREE from '../vendor/three.module.min.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const titileo = t => t < 0 ? 0 : t < 0.05 ? 1 : t < 0.11 ? 0.12 : t < 0.19 ? 0.75 : t < 0.25 ? 0.2 : 1;   // como la linterna al encender

export function crearVelas({ scene, mapa, P, linea, defs = [], huecos = [], evitar = [], encendidas = {}, sfx = null, luces = 2, reducido = false }) {
  const { W, H, C, at, solido } = mapa;
  const grupo = new THREE.Group(); grupo.name = 'velas'; scene.add(grupo);
  const lib = [], keep = o => (lib.push(o), o);
  let semilla = 911; const R = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const glow = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return keep(new THREE.CanvasTexture(cv));
  })();
  const MAT = {
    cera: keep(new THREE.MeshLambertMaterial({ color: 0xe2d9c4 })), plato: keep(new THREE.MeshLambertMaterial({ color: 0x7a4a33 })),
    mecha: keep(new THREE.MeshBasicMaterial({ color: 0x1a1612 })),
    llama: keep(new THREE.MeshBasicMaterial({ color: 0xffb460, transparent: true, opacity: 0.92, depthWrite: false })),
    nucleo: keep(new THREE.MeshBasicMaterial({ color: 0xfff3d6 })),
  };
  const GEO = {
    cera: keep(new THREE.CylinderGeometry(0.034, 0.038, 1, 10).translate(0, 0.5, 0)),
    gota: keep(new THREE.SphereGeometry(1, 6, 4)),
    plato: keep(new THREE.CylinderGeometry(0.075, 0.064, 0.016, 14).translate(0, 0.008, 0)),
    mecha: keep(new THREE.CylinderGeometry(0.004, 0.004, 0.024, 4).translate(0, 0.012, 0)),
    llama: keep(new THREE.ConeGeometry(0.02, 0.07, 8).translate(0, 0.035, 0)),
    nucleo: keep(new THREE.ConeGeometry(0.009, 0.032, 6).translate(0, 0.016, 0)),
    aro: keep(new THREE.RingGeometry(0.2, 0.235, 40).rotateX(-Math.PI / 2)),
    charco: keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  };
  const mesh = (par, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); par.add(o); return o; };

  // ---------- Ubicación: muestreo del punto más lejano ----------
  const usados = evitar.map(p => [p[0], p[1]]);
  const lejos = (x, z) => usados.reduce((m, [ux, uz]) => Math.min(m, Math.hypot(x - ux, z - uz)), 1e9);
  const libre = (x, z) => !solido(Math.floor(x / C), Math.floor(z / C));
  const puertas = huecos.map(h => {
    const fx = h[4] - h[0], fz = h[5] - h[2], n = Math.hypot(fx, fz) || 1;
    return [h[4] + fx / n * 0.16, h[5] + fz / n * 0.16];
  }).filter(p => libre(p[0], p[1]));
  const pisos = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!solido(x, y)) pisos.push([x, y]);
  const enSuelo = ([x, y]) => [(x + .5) * C, (y + .5) * C];
  const enBorde = ([x, y]) => N4.filter(([dx, dy]) => at(x + dx, y + dy) === '#').map(([dx, dy]) => [(x + .5 + dx * 0.3) * C, (y + .5 + dy * 0.3) * C]);
  const candidatos = {
    mausoleo: () => puertas,
    borde: () => pisos.flatMap(enBorde),
    suelo: () => pisos.map(enSuelo),
  };
  function mejor(lista) { let b = null, bd = -1; lista.forEach(p => { const d = lejos(p[0], p[1]); if (d > bd) { bd = d; b = p; } }); return b; }
  function ubicar(def) {
    if (def.celda && !solido(def.celda[0], def.celda[1])) {
      const c = def.lugar === 'suelo' ? [enSuelo(def.celda)] : enBorde(def.celda); return mejor(c.length ? c : [enSuelo(def.celda)]);
    }
    return mejor((candidatos[def.lugar] || candidatos.suelo)()) || mejor(candidatos.borde()) || mejor(candidatos.suelo());
  }
  // Primero las más restringidas (mausoleo → borde → suelo), así no se quedan sin lugar
  const orden = { mausoleo: 0, borde: 1, suelo: 2 }, pos = new Array(defs.length);
  defs.map((d, i) => i).sort((a, b) => (orden[defs[a].lugar] ?? 2) - (orden[defs[b].lugar] ?? 2)).forEach(i => {
    const p = ubicar(defs[i]); pos[i] = p; usados.push(p);
  });

  const lista = defs.map((def, i) => {
    const [x, z] = pos[i];
    const id = def.id || 'vela' + (i + 1), h = 0.11 + R() * 0.1, g = new THREE.Group(); g.name = 'vela_' + id; g.position.set(x, 0, z); g.rotation.y = R() * 6.28; grupo.add(g);
    mesh(g, GEO.plato, MAT.plato, 0, 0, 0);
    mesh(g, GEO.cera, MAT.cera, 0, 0.016, 0, 1, h, 1);
    for (let k = 0; k < 3; k++) { const a = R() * 6.28, r = 0.036; mesh(g, GEO.gota, MAT.cera, Math.cos(a) * r, 0.016 + h * (0.55 + R() * 0.4), Math.sin(a) * r, 0.007, 0.02 + R() * 0.014, 0.007); }
    const top = 0.016 + h;
    mesh(g, GEO.mecha, MAT.mecha, 0, top, 0);
    const llama = mesh(g, GEO.llama, MAT.llama, 0, top + 0.012, 0), nucleo = mesh(g, GEO.nucleo, MAT.nucleo, 0, top + 0.012, 0);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xffa860, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    halo.position.set(0, top + 0.05, 0); halo.scale.setScalar(0.55); g.add(halo);
    const charco = new THREE.Mesh(GEO.charco, keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xff9a50, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    charco.position.set(0, 0.012, 0); charco.scale.setScalar(1.6); charco.renderOrder = 4; g.add(charco);
    const aros = [0, 1].map(() => { const m = new THREE.Mesh(GEO.aro, keep(new THREE.MeshBasicMaterial({ color: 0xf0b060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))); m.renderOrder = 5; m.visible = false; m.position.set(x, 0.016, z); grupo.add(m); return m; });
    const v = { id, tipo: 'vela', lugar: def.lugar || 'suelo', x, z, top, g, llama, nucleo, halo, charco, aros, enc: !!encendidas[id], t: 1, ph: R() * 6.28, cerca: false, cercaT: 0,
      p: new THREE.Vector3(x, 0.15, z), fp: new THREE.Vector3(x, 0, z), luz: new THREE.Vector3(x, top + 0.12, z) };
    pintarLlama(v, 0, 0);
    return v;
  });

  // Pool fijo de luces reales (no recompila shaders): las velas encendidas más cercanas
  const pool = Array.from({ length: luces }, () => { const l = new THREE.PointLight(0xffa860, 0, 3.6, 2); grupo.add(l); return l; });

  function pintarLlama(v, k, f) {
    const on = k > 0.001; v.llama.visible = v.nucleo.visible = on;
    v.llama.scale.set(0.9 + 0.1 * f, Math.max(0.01, k * f), 0.9 + 0.1 * f); v.nucleo.scale.set(1, Math.max(0.01, k), 1);
    v.halo.material.opacity = 0.55 * k * f; v.charco.material.opacity = 0.3 * k * f;
  }
  function objetivos() { return lista.filter(v => !v.enc); }
  function encender(id) {
    const v = lista.find(x => x.id === id); if (!v || v.enc) return;
    v.enc = true; v.t = 0; v.aros.forEach(a => { a.visible = false; });
    if (sfx && sfx.cerillo) sfx.cerillo();
  }
  function apagar() { lista.forEach(v => { v.enc = false; v.t = 1; pintarLlama(v, 0, 0); }); pool.forEach(l => { l.intensity = 0; }); }
  const cerca = [];
  function update(dt, T) {
    cerca.length = 0;
    lista.forEach(v => {
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      if (!v.enc) {
        if ((v.cercaT -= dt) <= 0) { v.cercaT = 0.3; v.cerca = d < 8 && linea(P.x, P.z, v.x, v.z); }
        const k = v.cerca ? 1 - sstep(4.5, 8, d) : 0, [a, b] = v.aros, u = (T * 0.6 + v.ph) % 1;
        a.visible = b.visible = k > 0.01;
        if (a.visible) { a.material.opacity = k * 0.5; b.scale.setScalar(1 + u * (reducido ? 0.4 : 1.1)); b.material.opacity = k * 0.6 * (1 - u); }
        return;
      }
      v.t += dt;
      const f = 0.84 + 0.1 * Math.sin(T * 11 + v.ph) + 0.06 * Math.sin(T * 23.7 + v.ph * 2), k = v.t < 0.3 ? titileo(v.t) * sstep(0, 0.3, v.t + 0.05) : 1;
      pintarLlama(v, k, f); v.k = k * f;
      v.llama.rotation.z = Math.sin(T * 7 + v.ph) * 0.08;
      if (d < 10) cerca.push([v, d]);
    });
    cerca.sort((a, b) => a[1] - b[1]);
    pool.forEach((l, i) => { const c = cerca[i]; if (!c) { l.intensity = 0; return; } l.position.copy(c[0].luz); l.intensity = 1.8 * c[0].k; });
  }
  return { grupo, lista, objetivos, encender, apagar, update, dispose() { lib.forEach(o => o.dispose()); scene.remove(grupo); } };
}
