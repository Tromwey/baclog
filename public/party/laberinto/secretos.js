// Secretos del cementerio: 4 cuervos posados en los árboles (se encuentran mirándolos de frente un momento)
// y una calabaza encendida que solo aparece cuando los tres gatos ya recibieron su objeto.
// Además, un gato blanco en un árbol: al verlo, el personaje piensa que no debería molestarlo; si lo molestas, salta (susto).
// Estado (lab.v1): cache.cuervos = { id: true }, cache.calabaza = true. Los lee el Mausoleo para los logros.
import * as THREE from '../vendor/three.module.min.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const MIRA_COS = Math.cos(6 * Math.PI / 180), MIRA_T = 0.45, MIRA_D = 11;

export function crearSecretos({ scene, mapa, P, linea, cam = null, copas = [], evitar = [], estado = {}, sfx = null, reducido = false, alCuervo = null, alGatoBlanco = null, cuantos = 4 }) {
  const { W, H, C, at, solido } = mapa;
  const grupo = new THREE.Group(); grupo.name = 'secretos'; scene.add(grupo);
  const lib = [], keep = o => (lib.push(o), o);
  let semilla = 7177; const R = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const glow = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)); })();

  // ---------- Cuervos ----------
  const NEGRO = keep(new THREE.MeshPhongMaterial({ color: 0x15161b, specular: 0x3a4660, shininess: 30 }));
  const PICO = keep(new THREE.MeshLambertMaterial({ color: 0x2a2620 }));
  const OJO = keep(new THREE.MeshBasicMaterial({ color: 0xd9b45a }));
  const G = {
    cuerpo: keep(new THREE.SphereGeometry(1, 12, 8)), cabeza: keep(new THREE.SphereGeometry(1, 10, 8)),
    pico: keep(new THREE.ConeGeometry(0.018, 0.07, 6).rotateX(Math.PI / 2)), ala: keep(new THREE.BoxGeometry(1, 1, 1)), ojo: keep(new THREE.SphereGeometry(0.009, 6, 4)),
  };
  function modeloCuervo() {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(G.cuerpo, NEGRO); cuerpo.scale.set(0.07, 0.075, 0.13); cuerpo.position.set(0, 0.09, 0); cuerpo.rotation.x = -0.35; g.add(cuerpo);
    const cab = new THREE.Group(); cab.position.set(0, 0.17, 0.09); g.add(cab);
    const cabeza = new THREE.Mesh(G.cabeza, NEGRO); cabeza.scale.setScalar(0.048); cab.add(cabeza);
    const pico = new THREE.Mesh(G.pico, PICO); pico.position.set(0, -0.006, 0.065); cab.add(pico);
    [-1, 1].forEach(s => { const o = new THREE.Mesh(G.ojo, OJO); o.position.set(s * 0.03, 0.012, 0.03); cab.add(o); });
    const alas = [-1, 1].map(s => { const piv = new THREE.Group(); piv.position.set(s * 0.055, 0.12, 0.0); g.add(piv); const a = new THREE.Mesh(G.ala, NEGRO); a.scale.set(0.16, 0.012, 0.12); a.position.set(s * 0.07, 0, -0.02); piv.add(a); piv.rotation.z = s * -1.25; return { piv, s }; });
    const cola = new THREE.Mesh(G.ala, NEGRO); cola.scale.set(0.06, 0.01, 0.12); cola.position.set(0, 0.06, -0.15); cola.rotation.x = 0.35; g.add(cola);
    [-1, 1].forEach(s => { const p = new THREE.Mesh(G.ala, PICO); p.scale.set(0.008, 0.05, 0.008); p.position.set(s * 0.025, 0.02, 0.01); g.add(p); });
    return { g, cab, alas };
  }
  // Árboles bien repartidos: el primero, el más lejos del inicio; luego, cada uno lo más lejos de los anteriores
  const elegidas = [];
  if (copas.length) {
    const lejos = (c, ps) => ps.reduce((m, [x, z]) => Math.min(m, Math.hypot(c.x - x, c.z - z)), 1e9);
    const base = [[mapa.inicio.x, mapa.inicio.z]];
    while (elegidas.length < Math.min(cuantos, copas.length)) {
      let b = null, bd = -1; const ref = elegidas.length ? elegidas.map(c => [c.x, c.z]) : base;
      copas.forEach(c => { if (elegidas.includes(c)) return; const d = lejos(c, ref); if (d > bd) { bd = d; b = c; } });
      elegidas.push(b);
    }
  }
  const cuervos = elegidas.map((c, i) => {
    const id = 'cuervo' + (i + 1), a = R() * 6.28, m = modeloCuervo();
    const rx = c.tipo === 'cipres' ? 0.09 * c.s : 0.16, y = c.tipo === 'cipres' ? c.y - 0.55 * c.s : c.y;
    const x = c.x + Math.cos(a) * rx, z = c.z + Math.sin(a) * rx;
    m.g.position.set(x, y, z); m.g.rotation.y = Math.atan2(x - c.x, z - c.z) + (R() - .5) * 0.8; m.g.name = id; grupo.add(m.g);
    const v = { id, ...m, x, y, z, p: new THREE.Vector3(x, y + 0.12, z), estado: estado.cuervos && estado.cuervos[id] ? 'visto' : 'posado', mira: 0, vuela: 0, ph: R() * 6.28, dir: new THREE.Vector3(), tGr: 5 + R() * 12 };
    if (v.estado === 'visto') m.g.visible = false;
    return v;
  });

  // ---------- Calabaza ----------
  const NARANJA = keep(new THREE.MeshLambertMaterial({ color: 0xd8701e })), TALLO = keep(new THREE.MeshLambertMaterial({ color: 0x4d4a26 }));
  const caraTex = (() => {   // la cara mira a +z (u = 0.25 de la esfera); brilla desde adentro
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d'), cx = 128, cy = 128;
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#ffcf6a';
    [[-1, 1], [1, 1]].forEach(([s]) => { g.beginPath(); g.moveTo(cx + s * 18, cy - 10); g.lineTo(cx + s * 40, cy - 10); g.lineTo(cx + s * 29, cy - 34); g.closePath(); g.fill(); });
    g.beginPath(); g.moveTo(cx - 6, cy + 4); g.lineTo(cx + 6, cy + 4); g.lineTo(cx, cy - 8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx - 46, cy + 18); [[-30, 30], [-22, 22], [-12, 34], [0, 24], [12, 34], [22, 22], [30, 30], [46, 18], [34, 46], [-34, 46]].forEach(([dx, dy]) => g.lineTo(cx + dx, cy + dy)); g.closePath(); g.fill();
    const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const geoCalabaza = (() => {   // esfera achatada con gajos
    const geo = keep(new THREE.SphereGeometry(0.2, 32, 18)), p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const phi = Math.atan2(v.z, -v.x), k = 1 - 0.07 * (0.5 - 0.5 * Math.cos(phi * 10)); v.x *= k; v.z *= k; v.y *= 0.78; p.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals(); return geo;
  })();
  const matCalabaza = keep(new THREE.MeshLambertMaterial({ color: 0xd8701e, emissive: 0xffa040, emissiveMap: caraTex }));
  function modeloCalabaza() {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(geoCalabaza, matCalabaza); cuerpo.position.y = 0.155; g.add(cuerpo);
    const tallo = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.022, 0.07, 6)), TALLO); tallo.position.set(0, 0.32, 0); tallo.rotation.z = 0.25; g.add(tallo);
    return g;
  }
  // Lugar: lo más lejos posible de todo lo demás, al pie de una parcela
  const usados = evitar.map(p => [p[0], p[1]]);
  const lejosU = (x, z) => usados.reduce((m, [ux, uz]) => Math.min(m, Math.hypot(x - ux, z - uz)), 1e9);
  let cal = null;
  {
    let b = null, bd = -1;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (solido(x, y)) continue; const d = lejosU((x + .5) * C, (y + .5) * C); if (d > bd) { bd = d; b = [x, y]; } }
    if (b) {
      const [x, y] = b, lados = N4.filter(([dx, dy]) => at(x + dx, y + dy) === '#'), [dx, dy] = lados.length ? lados[0] : [0, 0];
      const px = (x + .5 + dx * 0.3) * C, pz = (y + .5 + dy * 0.3) * C, obj = modeloCalabaza();
      obj.position.set(px, 0, pz); obj.rotation.y = Math.atan2(-dx, -dy); grupo.add(obj);
      const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xff9a40, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
      halo.position.set(px, 0.2, pz); halo.scale.setScalar(1.1); grupo.add(halo);
      const charco = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xff8a30, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
      charco.position.set(px, 0.012, pz); charco.renderOrder = 4; grupo.add(charco);
      cal = { id: 'calabaza', tipo: 'calabaza', obj, halo, charco, x: px, z: pz, frente: lados.length ? [-dx, -dy] : [0, 1], baile: false, p: new THREE.Vector3(px, 0.15, pz), fp: new THREE.Vector3(px, 0, pz), activa: !!estado.calabazaActiva, estado: estado.calabaza ? 'llevas' : 'escondido', saca: 0, ph: R() * 6.28 };
      obj.visible = cal.activa && cal.estado === 'escondido';
    }
  }

  // ---------- Gato blanco en un árbol ----------
  const BLANCO = keep(new THREE.MeshLambertMaterial({ color: 0xe9e6df, emissive: 0x16150f })), OJOV = keep(new THREE.MeshBasicMaterial({ color: 0xa8f070 }));
  const PUPILA = keep(new THREE.MeshBasicMaterial({ color: 0x0a0a08 })), BOCA = keep(new THREE.MeshBasicMaterial({ color: 0x2a0606 })), ROSA = keep(new THREE.MeshLambertMaterial({ color: 0xd99a9a }));
  const GG = { esf: keep(new THREE.SphereGeometry(1, 14, 10)), oreja: keep(new THREE.ConeGeometry(1, 1, 4)), cola: keep(new THREE.CylinderGeometry(1, 0.7, 1, 6)), caja: keep(new THREE.BoxGeometry(1, 1, 1)), colmillo: keep(new THREE.ConeGeometry(1, 1, 5)) };
  const m3 = (geo, mat, par, p, sc, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(p[0], p[1], p[2]); o.scale.set(sc[0], sc[1], sc[2]); if (r) o.rotation.set(r[0], r[1], r[2]); par.add(o); return o; };
  function modeloGatoB() {   // echado sobre la rama, la cola colgando
    const g = new THREE.Group();
    m3(GG.esf, BLANCO, g, [0, 0.07, 0], [0.085, 0.07, 0.15]);
    m3(GG.esf, BLANCO, g, [0, 0.13, 0.13], [0.062, 0.058, 0.06]);
    [-1, 1].forEach(sx => { m3(GG.oreja, BLANCO, g, [sx * 0.034, 0.185, 0.125], [0.022, 0.045, 0.018], [0, 0, sx * -0.25]); m3(GG.esf, OJOV, g, [sx * 0.024, 0.14, 0.183], [0.011, 0.008, 0.006]); });
    m3(GG.cola, BLANCO, g, [0.06, -0.08, -0.12], [0.013, 0.24, 0.013], [0.1, 0, 0.15]);
    return g;
  }
  function caraSusto() {   // cara grande con la boca abierta, para el salto a la cámara
    const g = new THREE.Group();
    m3(GG.esf, BLANCO, g, [0, 0, 0], [0.13, 0.115, 0.11]);
    [-1, 1].forEach(sx => {
      m3(GG.oreja, BLANCO, g, [sx * 0.075, 0.12, -0.01], [0.045, 0.1, 0.035], [0, 0, sx * -0.35]);
      m3(GG.oreja, ROSA, g, [sx * 0.074, 0.115, 0.012], [0.026, 0.07, 0.01], [0, 0, sx * -0.35]);
      m3(GG.esf, OJOV, g, [sx * 0.05, 0.03, 0.095], [0.034, 0.014, 0.012], [0, 0, sx * -0.4]);
      m3(GG.caja, PUPILA, g, [sx * 0.05, 0.03, 0.107], [0.005, 0.03, 0.002], [0, 0, sx * -0.15]);
      [0.016, 0.04].forEach((ox, j) => m3(GG.colmillo, BLANCO, g, [sx * ox, -0.045, 0.1], [0.008, j ? 0.022 : 0.036, 0.008], [Math.PI, 0, 0]));
      m3(GG.caja, PUPILA, g, [sx * 0.05, 0.06, 0.1], [0.05, 0.008, 0.004], [0, 0, sx * 0.45]);
    });
    m3(GG.esf, BOCA, g, [0, -0.07, 0.085], [0.066, 0.056, 0.024]);
    m3(GG.esf, ROSA, g, [0, -0.005, 0.11], [0.012, 0.008, 0.006]);
    return g;
  }
  let gatoB = null;
  {
    const libres = copas.filter(c => !elegidas.includes(c)), lejosC = c => [...elegidas, { x: mapa.inicio.x, z: mapa.inicio.z }].reduce((mm, e) => Math.min(mm, Math.hypot(c.x - e.x, c.z - e.z)), 1e9);
    const cand = (libres.some(c => c.tipo === 'seco') ? libres.filter(c => c.tipo === 'seco') : libres).sort((a, b) => lejosC(b) - lejosC(a))[0];
    if (cand) {
      const cx = Math.floor(cand.x / C), cy = Math.floor(cand.z / C), lado = N4.find(([dx, dy]) => !solido(cx + dx, cy + dy)) || [0, 1];
      const yaw = Math.atan2(lado[0], lado[1]), y = cand.tipo === 'cipres' ? cand.y - 0.55 * cand.s : cand.y;
      const x = cand.x + lado[0] * 0.12, z = cand.z + lado[1] * 0.12, obj = modeloGatoB();
      obj.position.set(x, y, z); obj.rotation.y = yaw; obj.name = 'gato_blanco'; grupo.add(obj);
      const fp = new THREE.Vector3((cx + .5 + lado[0] * 0.55) * C, 0, (cy + .5 + lado[1] * 0.55) * C);
      gatoB = { id: 'gatoBlanco', tipo: 'gatoBlanco', obj, x, y, z, p: new THREE.Vector3(x, y, z), fp, cabeza: new THREE.Vector3(x + Math.sin(yaw) * 0.13, y + 0.14, z + Math.cos(yaw) * 0.13), mira: 0, ultimo: -99, susto: 0, cara: null, vuelve: 0 };
    }
  }
  function asustar() {
    if (!gatoB || gatoB.susto || !cam) return false;
    gatoB.susto = 0.001; gatoB.obj.visible = false;
    const cara = caraSusto(); cara.position.set(0, -0.03, -0.34); cara.scale.setScalar(0.35); cam.add(cara); gatoB.cara = cara;
    if (sfx && sfx.susto) sfx.susto();
    alGatoBlanco && alGatoBlanco('susto');
    return true;
  }

  // ---------- Bucle ----------
  const fw = new THREE.Vector3(), tmp = new THREE.Vector3();
  function update(dt, T, cam) {
    if (cam) cam.getWorldDirection(fw);
    cuervos.forEach(v => {
      if (v.estado === 'visto' && !v.vuela) return;
      if (v.vuela) {   // sale volando hacia el cielo, aleteando
        v.vuela += dt; const k = v.vuela;
        v.g.position.addScaledVector(v.dir, dt * (1.5 + k * 3)); v.g.position.y += dt * (1.2 + k * 1.5);
        v.alas.forEach(({ piv, s }) => { piv.rotation.z = s * (Math.sin(k * 28) * 0.9); });
        if (k > 2.6) { v.vuela = 0; v.g.visible = false; }
        return;
      }
      v.cab.rotation.y = Math.sin(T * 0.7 + v.ph) * 0.6 + (Math.sin(T * 2.3 + v.ph * 2) > 0.92 ? 0.4 : 0);
      // Pista para encontrarlos: de vez en cuando graznan bajito si estás cerca (con su lado izq./der.)
      if ((v.tGr -= dt) <= 0) {
        v.tGr = 14 + R() * 10; const dx = v.x - P.x, dz = v.z - P.z, dd = Math.hypot(dx, dz);
        if (dd < 15 && sfx && sfx.graznido) sfx.graznido(Math.pow(1 - dd / 15, 1.3) * 0.6, clamp((dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / (dd || 1), -1, 1) * 0.85);
      }
      if (!cam) return;
      tmp.copy(v.p).sub(cam.position); const d = tmp.length(), cosA = tmp.dot(fw) / (d || 1);
      if (d < MIRA_D && cosA > MIRA_COS) { v.mira += dt; if (v.mira > MIRA_T) espantar(v); }
      else v.mira = Math.max(0, v.mira - dt * 2);
    });
    if (gatoB) {
      if (gatoB.susto) {
        gatoB.susto += dt; const k = gatoB.susto, c = gatoB.cara;
        if (c) {
          c.scale.setScalar(k < 0.07 ? 0.35 + (k / 0.07) * 0.75 : 1.1);
          c.position.set((Math.random() - .5) * (reducido ? 0.004 : 0.02), -0.03 + (Math.random() - .5) * (reducido ? 0.004 : 0.016), -0.34);
          c.rotation.z = (Math.random() - .5) * (reducido ? 0.03 : 0.12);
          c.visible = reducido || k < 0.5 || Math.sin(k * 90) > -0.6;   // parpadea al final
          if (k > 0.85) { cam.remove(c); gatoB.cara = null; alGatoBlanco && alGatoBlanco('fin'); }
        }
        if (k > 3) { gatoB.susto = 0; gatoB.obj.visible = true; }
      } else if (cam) {
        tmp.copy(gatoB.cabeza).sub(cam.position); const d = tmp.length(), cosA = tmp.dot(fw) / (d || 1);
        if (d < 9 && cosA > Math.cos(8 * Math.PI / 180)) { gatoB.mira += dt; if (gatoB.mira > 0.4 && T - gatoB.ultimo > 25) { gatoB.ultimo = T; alGatoBlanco && alGatoBlanco('visto'); } }
        else gatoB.mira = 0;
        gatoB.obj.rotation.z = Math.sin(T * 0.5) * 0.02;
      }
    }
    if (cal && cal.activa) {
      if (cal.saca > 0) { cal.saca += dt; cal.obj.scale.setScalar(Math.max(0.001, 1 - sstep(0, 0.3, cal.saca))); cal.obj.position.y = cal.saca * 0.5; if (cal.saca > 0.3) { cal.saca = 0; cal.obj.visible = false; } }
      const f = cal.estado === 'escondido' || cal.baile ? 0.85 + 0.1 * Math.sin(T * 9 + cal.ph) + 0.05 * Math.sin(T * 23) : 0;
      cal.halo.material.opacity = 0.5 * f; cal.charco.material.opacity = 0.35 * f; matCalabaza.emissiveIntensity = 0.6 + 0.4 * f;
    }
  }
  function espantar(v) {
    v.estado = 'visto'; v.vuela = 0.001; v.mira = 0;
    v.dir.set(v.x - P.x, 0, v.z - P.z).normalize();
    if (sfx && sfx.graznido) { const dx = v.x - P.x, dz = v.z - P.z, dd = Math.hypot(dx, dz) || 1; sfx.graznido(0.9, clamp((dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / dd, -1, 1) * 0.8); }
    alCuervo && alCuervo(v.id, cuervos.filter(c => c.estado === 'visto').length, cuervos.length);
  }
  return {
    grupo, cuervos, calabaza: cal,
    gatoBlanco: gatoB, asustar,
    objetivos() { return [...(cal && cal.activa && cal.estado === 'escondido' && !cal.saca ? [cal] : []), ...(gatoB && !gatoB.susto ? [gatoB] : [])]; },
    mostrarCalabaza(v) { if (!cal) return; cal.baile = !!v; cal.saca = 0; cal.obj.scale.setScalar(1); cal.obj.position.y = 0; cal.obj.visible = !!v || cal.estado === 'escondido'; },
    activarCalabaza() { if (!cal || cal.activa) return false; cal.activa = true; cal.obj.visible = cal.estado === 'escondido'; return true; },
    recogerCalabaza() { if (!cal || cal.estado !== 'escondido') return; cal.estado = 'llevas'; cal.saca = 0.001; },
    modelo(id) { return id === 'calabaza' ? modeloCalabaza() : modeloCuervo().g; },
    es: id => id === 'calabaza',
    update,
    reset() {
      cuervos.forEach(v => { v.estado = 'posado'; v.vuela = 0; v.mira = 0; v.g.visible = true; v.g.position.set(v.x, v.y, v.z); v.alas.forEach(({ piv, s }) => { piv.rotation.z = s * -1.25; }); });
      if (cal) { cal.estado = 'escondido'; cal.saca = 0; cal.obj.scale.setScalar(1); cal.obj.position.y = 0; cal.obj.visible = cal.activa; }
    },
    dispose() { lib.forEach(o => o.dispose()); scene.remove(grupo); },
  };
}
