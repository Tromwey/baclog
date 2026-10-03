// Motor del laberinto: mapa en grid, escena, jugador con colisiones por celda, controles, objetivos,
// exploración (fog of war) y ruta al Mausoleo. No sabe nada de minijuegos ni de UI: avisa por callbacks
// (on.objetivo, on.interactuar, on.desbloqueo, on.bloqueo, on.bloqueoFallido, on.paso, on.toque, on.explorar).
import * as THREE from '../vendor/three.module.min.js';
import { texMuro, texSuelo, texPiedra, texGrabado, texLetrero, rng, fbm } from './texturas.js';
import { crearDeco } from './deco.js';
import { construirCementerio } from './cementerio.js';
import { crearVelas } from './velas.js';
import { crearPistas } from './pistas.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const esMuro = c => c === '#' || c === 'M';
const esSolido = c => c === '#' || c === 'M' || (c >= 'a' && c <= 'z');
const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
export const GLIFOS = '0123456789/#%&@$*?§¿░▒▓█';
function dibujarGlitch(l) {
  const cv = l.glitchCv, g = cv.getContext('2d'), W = cv.width, H = cv.height, R_ = Math.random;
  g.clearRect(0, 0, W, H);
  if (R_() < 0.08) { l.glitchTex.needsUpdate = true; return; }          // a veces se apaga del todo
  let s = ''; for (let i = 0; i < l.glitchN; i++) s += GLIFOS[Math.floor(R_() * GLIFOS.length)];
  g.font = `400 ${l.glitchFs}px Cinzel, Georgia, serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  const y = H / 2, ox = 12;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,40,70,.85)'; g.fillText(s, ox - 3 + R_() * 2, y);
  g.fillStyle = 'rgba(40,220,255,.85)'; g.fillText(s, ox + 3 - R_() * 2, y + (R_() - .5) * 3);
  g.fillStyle = 'rgba(235,240,255,.9)'; g.fillText(s, ox, y);
  g.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 3; k++) { const sy = Math.floor(R_() * H), sh = 2 + Math.floor(R_() * 8), dx = Math.round((R_() - .5) * 26); const st = g.getImageData(0, sy, W, sh); g.clearRect(0, sy, W, sh); g.putImageData(st, dx, sy); }
  for (let k = 0; k < 5; k++) { g.fillStyle = R_() < .5 ? 'rgba(235,240,255,.5)' : 'rgba(40,220,255,.45)'; g.fillRect(R_() * W, R_() * H, 3 + R_() * 18, 1 + R_() * 4); }
  l.glitchTex.needsUpdate = true;
}
const titileo = t => t < 0 ? 0 : t < 0.05 ? 1 : t < 0.11 ? 0.12 : t < 0.19 ? 0.75 : t < 0.25 ? 0.2 : 1;
const R = 0.3, VEL = 2.4, OJO = 1.6, ALCANCE = 2.7, VISTA = 4;

export function leerMapa(j) {
  const g = j.grid, H = g.length, W = g[0].length, C = j.celda, A = j.alturaMuro;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : (g[y][x] || '#');
  const frente = (x, y) => N4.find(([dx, dy]) => !esSolido(at(x + dx, y + dy))) || [0, 1];
  const m = { W, H, C, A, at, solido: (x, y) => esSolido(at(x, y)), lapidas: [], tumbas: [], puerta: null, inicio: null, version: j.version };
  g.forEach((row, y) => { if (row.length !== W) console.warn(`mapa.json: la fila ${y} mide ${row.length}, se esperaban ${W}`); });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 'S') { const [dx, dy] = frente(x, y); m.inicio = { x: (x + .5) * C, z: (y + .5) * C, yaw: Math.atan2(-dx, -dy), cx: x, cy: y }; }
    else if (c === 'M') m.puerta = { tipo: 'puerta', x, y, f: frente(x, y), nombre: 'Mausoleo', ...(j.puerta || {}) };
    else if (c >= 'a' && c <= 'z') {
      if (!j.lapidas[c]) { console.warn(`mapa.json: la letra "${c}" no tiene datos en "lapidas"`); continue; }
      const d = { tipo: 'lapida', letra: c, x, y, f: frente(x, y), ...j.lapidas[c] };
      if (d.final) { d.tipo = 'tumba'; m.tumba = d; }                      // la tumba final no tiene minijuego ni sello
      else if (d.leer) { d.tipo = 'tumba'; m.tumbas.push(d); }             // tumbas que solo se leen (la caja de música va en una)
      else m.lapidas.push(d);
    }
  }
  if (!m.inicio) throw new Error('mapa.json: falta la celda de inicio "S"');
  return m;
}

export function crearLaberinto({ renderer, json, stage, joy, ajustes, pos, explorado, sfx = null, tema = 'muros', estadoEncargos = {}, estadoVelas = {}, estadoPistas = {}, on = {} }) {
  const mapa = leerMapa(json), { W, H, C, A, at, solido } = mapa;
  const coarse = matchMedia('(pointer:coarse)').matches, cementerio = tema === 'cementerio';
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(70, 1, 0.05, 80); cam.rotation.order = 'YXZ'; scene.add(cam);
  const hemi = new THREE.HemisphereLight(0x5a6684, 0x0c0c0f, 0.3); scene.add(hemi);
  const luna = new THREE.DirectionalLight(0x9fb0d8, 0.35); luna.position.set(0.4, 1, -0.6); scene.add(luna);
  scene.fog = new THREE.Fog(0x08090c, 2.5, 17); scene.background = new THREE.Color(0x08090c);
  const LUZ = {
    noche:  { bg: 0x07080b, near: 2.5, far: 17, hemi: 0.3, luna: 0.35, lin: 22, cielo: [0x0d1018, 0x020203] },
    prueba: { bg: 0x1a1c22, near: 8, far: 32, hemi: 3.2, luna: 1.2, lin: 8, cielo: [0x2a2e38, 0x14161b] },
  };
  // Cementerio: la distancia se pierde en bruma gris azulada (no en negro), como en la entrada
  if (cementerio) Object.assign(LUZ.noche, { bg: 0x0b0d12, near: 1.2, far: 14, hemi: 0.07, luna: 0.1, lin: 28 * 0.7, cielo: [0x0b0d12, 0x020203] });
  const disposables = [];
  const keep = o => (disposables.push(o), o);

  // ---------- Texturas ----------
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (canvas, rep, srgb = true) => {
    const t = keep(new THREE.CanvasTexture(canvas)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.repeat.set(rep[0], rep[1]); return t;
  };
  const piedraC = texPiedra(), tPiedra = tex(piedraC, [2, 2]);

  let cem = null;
  if (cementerio) cem = construirCementerio({ scene, mapa, renderer, calidad: coarse ? 'baja' : 'alta' });
  else {
  const [muroC, muroH] = texMuro(), [sueloC, sueloH] = texSuelo();
  const tMuro = tex(muroC, [0.5, 0.5]), tMuroH = tex(muroH, [0.5, 0.5], false);
  const tSuelo = tex(sueloC, [W * C / 2, H * C / 2]), tSueloH = tex(sueloH, [W * C / 2, H * C / 2], false);
  // ---------- Muros: solo caras que dan a celdas abiertas, en bloques de 8×8 celdas ----------
  const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const chunks = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!esMuro(at(x, y))) continue;
    N4.forEach(([dx, dy], k) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || esMuro(at(nx, ny))) return;
      const key = (x >> 3) + ',' + (y >> 3);
      let ch = chunks.get(key); if (!ch) chunks.set(key, ch = { p: [], n: [], u: [], c: [], i: [] });
      const ex = (x + .5 + dx * .5) * C, ez = (y + .5 + dy * .5) * C, hx = dy * C / 2, hz = -dx * C / 2, b = ch.p.length / 3;
      ch.p.push(ex - hx, 0, ez - hz, ex + hx, 0, ez + hz, ex + hx, A, ez + hz, ex - hx, A, ez - hz);
      for (let v = 0; v < 4; v++) ch.n.push(dx, 0, dy);
      const u0 = (x * 7 + y * 3 + k) * C;          // desplaza el mosaico entre caras para que no se repita igual
      ch.u.push(u0, 0, u0 + C, 0, u0 + C, A, u0, A);
      const s = 0.92 + hash(x, y, k) * 0.16, lo = s * 0.42;
      ch.c.push(lo, lo, lo, lo, lo, lo, s, s, s, s, s, s);
      ch.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
  }
  const matMuro = keep(new THREE.MeshLambertMaterial({ map: tMuro, bumpMap: tMuroH, bumpScale: 2.2, vertexColors: true }));
  const muros = new THREE.Group(); muros.name = 'muros'; scene.add(muros);
  chunks.forEach((ch, key) => {
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(ch.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(ch.u, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(ch.c, 3));
    geo.setIndex(ch.i); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, matMuro); m.name = 'muro_' + key; muros.add(m);
  });
  const suelo = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * C, H * C)), keep(new THREE.MeshLambertMaterial({ map: tSuelo, bumpMap: tSueloH, bumpScale: 1.6 })));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(W * C / 2, 0, H * C / 2); suelo.name = 'suelo'; scene.add(suelo);
  }

  // Cielo con resplandor de luna (como en la entrada), luna, halo y nubes que derivan; todo sigue a la cámara
  const lunaDir = new THREE.Vector3(0.35, 0.62, -0.7).normalize();
  const cieloMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { cTop: { value: new THREE.Color() }, cHor: { value: new THREE.Color() }, cGlow: { value: new THREE.Color(0x2c3346) }, moonDir: { value: lunaDir } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 cTop, cHor, cGlow, moonDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(cHor, cTop, pow(h, 0.55));
        float g = max(dot(d, moonDir), 0.0); c += cGlow * (pow(g, 60.0) * 0.9 + pow(g, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const cielo = new THREE.Mesh(keep(new THREE.SphereGeometry(50, 32, 16)), cieloMat); cielo.name = 'cielo'; cielo.renderOrder = -3; scene.add(cielo);
  function pintarCielo(a, b) { cieloMat.uniforms.cHor.value.setHex(a); cieloMat.uniforms.cTop.value.setHex(b); }
  pintarCielo(...LUZ.noche.cielo);
  const lunaCol = new THREE.Color(0xc9ccd2), tmpN = new THREE.Vector3();
  const lunaM = new THREE.Mesh(keep(new THREE.CircleGeometry(2, 32)), keep(new THREE.MeshBasicMaterial({ color: 0xc9ccd2, fog: false, depthWrite: false })));
  const halo = new THREE.Mesh(keep(new THREE.CircleGeometry(6, 32)), keep(new THREE.MeshBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.07, fog: false, depthWrite: false })));
  [lunaM, halo].forEach(o => { o.renderOrder = -2; scene.add(o); });
  const sstN = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const nubeMaps = [0, 1, 2].map(k => {
    const Wc = 256, Hc = 128, n = fbm(rng(300 + k), Wc, Hc, 6, 3, 5), cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
    const g = cv.getContext('2d'), im = g.createImageData(Wc, Hc);
    for (let i = 0, j = 0; i < Wc * Hc; i++, j += 4) {
      const x = i % Wc, y = (i / Wc) | 0, u = x / Wc * 2 - 1, v = y / Hc * 2 - 1, e = 1 - (u * u * 1.15 + v * v * 1.7), d = n[i] - 0.5 + e * 0.5 - 0.16;
      im.data[j] = im.data[j + 1] = im.data[j + 2] = clamp(0.62 + 0.38 * (1 - y / Hc) + (n[i] - 0.5) * 0.5, 0, 1) * 255; im.data[j + 3] = sstN(0, 0.2, d) * 0.92 * 255;
    }
    g.putImageData(im, 0, 0); const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
  const nubes = new THREE.Group(); nubes.name = 'nubes'; scene.add(nubes);
  const Rn = rng(55), planoNube = keep(new THREE.PlaneGeometry(1, 1)), lunaAz = Math.atan2(lunaDir.x, -lunaDir.z);
  const nubeArr = Array.from({ length: coarse ? 6 : 9 }, (_, i) => {
    const mat = keep(new THREE.MeshBasicMaterial({ map: nubeMaps[i % 3], color: i % 3 === 2 ? 0x262a35 : 0x353b49, transparent: true, depthWrite: false, fog: false, opacity: 0.55 + Rn() * 0.3 }));
    const mm = new THREE.Mesh(planoNube, mat), w = 16 + Rn() * 14; mm.scale.set(w, w * 0.42, 1); mm.renderOrder = -1; mm.name = 'nube';
    mm.userData = { az: i === 0 ? lunaAz - 0.3 : Rn() * 6.28, el: i === 0 ? Math.asin(lunaDir.y) - 0.02 : 0.14 + Rn() * 0.5, v: 0.005 + Rn() * 0.007, w };
    nubes.add(mm); return mm;
  });


  // ---------- Lápidas y puerta ----------
  const MAT = {
    piedra:  keep(new THREE.MeshLambertMaterial({ color: 0xb4b0aa, map: tPiedra })),
    apagada: keep(new THREE.MeshLambertMaterial({ color: 0x6a6866, map: tPiedra })),
    tierra:  keep(new THREE.MeshLambertMaterial({ color: 0x2e2621 })),
    vela:    keep(new THREE.MeshLambertMaterial({ color: 0xd9d2c0 })),
    cabo:    keep(new THREE.MeshLambertMaterial({ color: 0x8a8476 })),
    llama:   keep(new THREE.MeshBasicMaterial({ color: 0xffc27a })),
    cera:    keep(new THREE.MeshLambertMaterial({ color: 0x8a3328 })),
    ceraIn:  keep(new THREE.MeshLambertMaterial({ color: 0x5e221b })),
    puerta:  keep(new THREE.MeshLambertMaterial({ color: 0x4a1f1a })),
    hierro:  keep(new THREE.MeshLambertMaterial({ color: 0x2a2a2e })),
    marco:   keep(new THREE.MeshLambertMaterial({ color: 0x8e8b86, map: tPiedra })),
    farol:   keep(new THREE.MeshBasicMaterial({ color: 0xffb07a })),
    petalo:  keep(new THREE.MeshBasicMaterial({ color: 0xe8902a, transparent: true, opacity: 0.85, depthWrite: false })),
  };
  const GEO = {
    losa:   keep(new THREE.BoxGeometry(0.78, 0.95, 0.16)),
    remate: keep(new THREE.CylinderGeometry(0.39, 0.39, 0.16, 20, 1, false, Math.PI / 2, Math.PI)),   // medio disco: no se superpone con la losa
    tumba:  keep(new THREE.BoxGeometry(0.9, 0.12, 1.1)),
    vela:   keep(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8)),
    cabo:   keep(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 8)),
    llama:  keep(new THREE.ConeGeometry(0.026, 0.07, 6)),
    puerta: keep(new THREE.BoxGeometry(1.3, 2.2, 0.1)),
    banda:  keep(new THREE.BoxGeometry(1.32, 0.07, 0.13)),
    dintel: keep(new THREE.BoxGeometry(1.8, 0.34, 0.26)),
    jamba:  keep(new THREE.BoxGeometry(0.22, 2.3, 0.26)),
    farol:  keep(new THREE.BoxGeometry(0.12, 0.18, 0.12)),
    sello:  keep(new THREE.CircleGeometry(0.15, 28)),
    selloIn: keep(new THREE.CircleGeometry(0.105, 28)),
    petalo: keep(new THREE.CircleGeometry(0.045, 6)),
  };
  const mesh = (g, m, x, y, z, name) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (name) o.name = name; return o; };
  const objetivos = [];
  const localAMundo = (grp, x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(grp.matrixWorld);
  const tz = mapa.tumba;
  [...mapa.lapidas, ...mapa.tumbas, ...(tz ? [tz] : [])].forEach(l => {
    const g = new THREE.Group(); g.name = (l.tipo === 'tumba' ? 'tumba_' : 'lapida_') + l.id;
    g.position.set((l.x + .5) * C, 0, (l.y + .5) * C); g.rotation.y = Math.atan2(l.f[0], l.f[1]);
    const cvG = texGrabado(l.nombre, l.fechas, piedraC, l.glitch || null);
    const frente = keep(new THREE.MeshLambertMaterial({ color: 0xb4b0aa, map: tex(cvG) }));
    frente.map.wrapS = frente.map.wrapT = THREE.ClampToEdgeWrapping;
    const losa = mesh(GEO.losa, [MAT.piedra, MAT.piedra, MAT.piedra, MAT.piedra, frente, MAT.piedra], 0, 0.475, -0.55, 'losa');
    const remate = mesh(GEO.remate, MAT.piedra, 0, 0.95, -0.55, 'remate'); remate.rotation.x = Math.PI / 2;
    const llama = mesh(GEO.llama, MAT.llama, 0.3, 0.315, -0.32, 'llama'), vela = mesh(GEO.vela, MAT.vela, 0.3, 0.2, -0.32, 'vela');
    const cabo = mesh(GEO.cabo, MAT.cabo, 0.3, 0.145, -0.32, 'cabo'); cabo.visible = false;
    const sello = new THREE.Group(); sello.name = 'sello'; sello.position.set(0, 0.749, -0.469); sello.scale.setScalar(0.8); sello.visible = l.tipo !== 'tumba';   // [Kura, founder 2026-10-02] arriba, donde estaba la cruz (antes y = 0.2, al pie)   // sin resolver: sellada y con la vela apagada
    sello.add(new THREE.Mesh(GEO.sello, MAT.cera), mesh(GEO.selloIn, MAT.ceraIn, 0, 0, 0.002));
    g.add(losa, remate, sello, mesh(GEO.tumba, MAT.tierra, 0, 0.06, 0.05, 'tumba'), vela, cabo, llama);
    // Fecha en glitch: un parche sin luz delante de la losa, redibujado a saltos (nunca muestra la fecha real)
    if (cvG.glitch) {
      const G = cvG.glitch, wpx = G.x1 - G.x0 + 12, hpx = G.fs * 1.9, cv = document.createElement('canvas');
      cv.width = Math.ceil(wpx * 2); cv.height = Math.ceil(hpx * 2);
      const gt = keep(new THREE.CanvasTexture(cv)); gt.colorSpace = THREE.SRGBColorSpace;
      const pl = mesh(keep(new THREE.PlaneGeometry(wpx / G.W * 0.78, hpx / G.H * 0.95)), keep(new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0.85, depthWrite: false })),
        ((G.x0 - 6 + wpx / 2) / G.W - 0.5) * 0.78, 0.95 * (1 - G.y / G.H), -0.468, 'fecha_glitch');
      g.add(pl); Object.assign(l, { glitchCv: cv, glitchTex: gt, glitchN: G.n, glitchFs: G.fs * 2, gT: 0 });
    }
    scene.add(g); g.updateMatrixWorld(true); llama.visible = false;
    Object.assign(l, { obj: g, llama, vela, cabo, losa, remate, frente, sello, sellada: false,
      p: localAMundo(g, 0, 0.7, -0.55), fp: localAMundo(g, 0, 0, C / 2 + 0.05), luzPos: localAMundo(g, 0.3, 0.42, -0.2) });
    objetivos.push(l);
  });
  {
    const Rf = rng(77), geo = keep(new THREE.IcosahedronGeometry(0.05, 0)), mat = keep(new THREE.MeshLambertMaterial({ color: 0xe8902a, emissive: 0x2a1204 }));
    const flores = new THREE.InstancedMesh(geo, mat, (mapa.lapidas.length + mapa.tumbas.length) * 10 + (tz ? 40 : 0)), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
    let n = 0;
    [...mapa.lapidas, ...mapa.tumbas, ...(tz ? [tz] : [])].forEach(l => (l.final ? [[-0.28, 0.22], [0.22, 0.3], [-0.05, 0.45], [0.3, -0.05]] : [[-0.24, 0.3], [0.18, 0.42]]).forEach(([bx, bz]) => {
      for (let i = 0; i < (l.final ? 10 : 5); i++) {
        p4.set(bx + (Rf() - .5) * 0.14, 0.15 + Rf() * 0.04, bz + (Rf() - .5) * 0.14).applyMatrix4(l.obj.matrixWorld);
        m4.compose(p4, q4.setFromEuler(new THREE.Euler(Rf() * 3, Rf() * 3, 0)), s4.setScalar(0.8 + Rf() * 0.5)); flores.setMatrixAt(n++, m4);
      }
    }));
    flores.count = n; flores.name = 'cempasuchil'; scene.add(flores); disposables.push({ dispose: () => flores.dispose() });
  }
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)); })();
  const halosF = [];
  const pz = mapa.puerta;
  let luzPuerta = null;
  if (pz) {
    const g = new THREE.Group(); g.name = 'puerta_mausoleo';
    g.position.set((pz.x + .5) * C, 0, (pz.y + .5) * C); g.rotation.y = Math.atan2(pz.f[0], pz.f[1]);
    const z = C / 2, letrero = keep(new THREE.MeshLambertMaterial({ color: 0x9c9892, map: tex(texLetrero((pz.nombre || 'Mausoleo').toUpperCase(), piedraC)) }));
    letrero.map.wrapS = letrero.map.wrapT = THREE.ClampToEdgeWrapping;
    g.add(mesh(GEO.puerta, MAT.puerta, 0, 1.1, z + 0.03, 'hoja'),
      mesh(GEO.banda, MAT.hierro, 0, 0.5, z + 0.04, 'banda'), mesh(GEO.banda, MAT.hierro, 0, 1.7, z + 0.04, 'banda'),
      mesh(GEO.dintel, [MAT.marco, MAT.marco, MAT.marco, MAT.marco, letrero, MAT.marco], 0, 2.37, z + 0.09, 'dintel'),
      mesh(GEO.jamba, MAT.marco, -0.76, 1.15, z + 0.09, 'jamba'), mesh(GEO.jamba, MAT.marco, 0.76, 1.15, z + 0.09, 'jamba'),
      mesh(GEO.farol, MAT.farol, -1.0, 1.85, z + 0.12, 'farol'), mesh(GEO.farol, MAT.farol, 1.0, 1.85, z + 0.12, 'farol'));
    luzPuerta = new THREE.PointLight(0xff8a5c, 6, 8, 2); luzPuerta.position.set(0, 2.0, z + 0.9); g.add(luzPuerta);
    [-1, 1].forEach(s => { const h = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa070, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.45 }))); h.position.set(s * 1.0, 1.85, z + 0.18); h.scale.setScalar(0.9); h.name = 'farol_halo'; g.add(h); halosF.push(h); });
    scene.add(g); g.updateMatrixWorld(true);
    Object.assign(pz, { obj: g, p: localAMundo(g, 0, 1.2, z), fp: localAMundo(g, 0, 0, z + 0.05) });
    objetivos.push(pz);
  }
  if (cem) cem.objetivos.forEach(o => objetivos.push(o));
  // Pool fijo de 3 luces de vela: se asignan a las lápidas encendidas más cercanas (no recompila shaders)
  const velas = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa860, 0, 5, 2); scene.add(l); return l; });

  // ---------- Linterna en la cámara ----------
  const linterna = cementerio ? new THREE.SpotLight(0xfff0d8, LUZ.noche.lin, 26, 20 * D2R, 0.55, 1.5) : new THREE.SpotLight(0xfff0d8, LUZ.noche.lin, 22, 0.46, 0.5, 1.5);
  linterna.position.set(0.15, -0.22, 0.05); cam.add(linterna); cam.add(linterna.target); linterna.target.position.set(0, -0.1, -4);

  // ---------- Jugador ----------
  const P = { x: mapa.inicio.x, z: mapa.inicio.z, yaw: mapa.inicio.yaw, pitch: 0, vx: 0, vz: 0 };
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) && !solido(Math.floor(pos.x / C), Math.floor(pos.z / C))) Object.assign(P, { x: pos.x, z: pos.z, yaw: pos.yaw || 0 });
  const pitchMax = () => (ajustes.giro === 'pasos' ? 35 : 60) * D2R;
  const clampPitch = () => { P.pitch = clamp(P.pitch, -pitchMax(), pitchMax()); };
  const celdaP = () => [Math.floor(P.x / C), Math.floor(P.z / C)];

  function resolver() {
    const gx = Math.floor(P.x / C), gy = Math.floor(P.z / C);
    for (let y = gy - 1; y <= gy + 1; y++) for (let x = gx - 1; x <= gx + 1; x++) {
      if (!solido(x, y)) continue;
      const x0 = x * C, z0 = y * C, qx = clamp(P.x, x0, x0 + C), qz = clamp(P.z, z0, z0 + C);
      const ex = P.x - qx, ez = P.z - qz, d2 = ex * ex + ez * ez;
      if (d2 >= R * R) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (R - d) / d; P.x += ex * k; P.z += ez * k; }
      else {
        const l = P.x - x0, r = x0 + C - P.x, t = P.z - z0, b = z0 + C - P.z, m = Math.min(l, r, t, b);
        if (m === l) P.x = x0 - R; else if (m === r) P.x = x0 + C + R; else if (m === t) P.z = z0 - R; else P.z = z0 + C + R;
      }
    }
  }

  // ---------- Exploración (fog of war) ----------
  const exp = new Uint8Array(W * H);
  let expVer = 0;
  if (explorado) {
    try { const b = atob(explorado); for (let i = 0; i < W * H; i++) exp[i] = (b.charCodeAt(i >> 3) >> (i & 7)) & 1; } catch (_) {}
  }
  function linea(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25);
    for (let i = 1; i < n; i++) { const u = i / n; if (solido(Math.floor((ax + (bx - ax) * u) / C), Math.floor((az + (bz - az) * u) / C))) return false; }
    return true;
  }
  function explorar(silencio) {
    const [gx, gy] = celdaP(); let cambio = false;
    const marcar = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!exp[i]) { exp[i] = 1; cambio = true; } };
    for (let y = gy - VISTA; y <= gy + VISTA; y++) for (let x = gx - VISTA; x <= gx + VISTA; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || solido(x, y)) continue;
      if (x === gx && y === gy || linea(P.x, P.z, (x + .5) * C, (y + .5) * C)) {
        marcar(x, y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (solido(x + dx, y + dy)) marcar(x + dx, y + dy);
      }
    }
    if (cambio) { expVer++; if (!silencio) on.explorar?.(); }
  }
  // Fracción de pasillos vistos (sin contar muros)
  function fraccionExplorada() { let a = 0, b = 0; for (let i = 0; i < W * H; i++) if (!solido(i % W, (i / W) | 0)) { b++; a += exp[i]; } return b ? a / b : 0; }
  function serializarExplorado() {
    const bytes = new Uint8Array((W * H + 7) >> 3);
    for (let i = 0; i < W * H; i++) if (exp[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s);
  }

  // ---------- Ruta al Mausoleo: BFS por celdas + pétalos en el suelo ----------
  let rutaOn = false, ruta = [], rutaDesde = '';
  const MAXP = 600;
  const petalos = new THREE.InstancedMesh(GEO.petalo, MAT.petalo, MAXP); petalos.name = 'petalos'; petalos.count = 0;
  petalos.frustumCulled = false; scene.add(petalos);
  function bfs(sx, sy, tx, ty) {
    const prev = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; prev[q[0]] = q[0];
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      if (x === tx && y === ty) { const out = []; for (let k = i; ; k = prev[k]) { out.push([k % W, (k / W) | 0]); if (prev[k] === k) break; } return out.reverse(); }
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (!solido(nx, ny) && prev[j] < 0) { prev[j] = i; q.push(j); } }
    }
    return [];
  }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpV = new THREE.Vector3();
  function trazarRuta() {
    const [gx, gy] = celdaP(), key = gx + ',' + gy;
    if (!rutaOn || !pz) { ruta = []; petalos.count = 0; rutaDesde = ''; return; }
    if (key === rutaDesde) return;
    rutaDesde = key;
    ruta = bfs(gx, gy, pz.x + pz.f[0], pz.y + pz.f[1]);
    const pts = ruta.map(([x, y]) => [(x + .5) * C, (y + .5) * C]);
    if (pts.length) pts[0] = [P.x, P.z]; if (pz) pts.push([pz.fp.x, pz.fp.z]);
    let n = 0;
    for (let s = 0; s < pts.length - 1 && n < MAXP; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / 0.22));
      for (let i = 0; i < k && n < MAXP; i++) {
        const u = i / k, Rr = rng((Math.round(ax * 10) * 73856093) ^ (Math.round(az * 10) * 19349663) ^ i);
        if (s === 0 && u * L < 0.9) continue;           // no tapar los pies del jugador
        const px = ax + (bx - ax) * u + (Rr() - .5) * 0.5, pz2 = az + (bz - az) * u + (Rr() - .5) * 0.5;
        tmpE.set(-Math.PI / 2, 0, Rr() * 6.28); tmpQ.setFromEuler(tmpE); const sc = 0.7 + Rr() * 0.6; tmpS.set(sc * 1.5, sc, 1);
        tmpM.compose(tmpV.set(px, 0.012 + n * 0.00001, pz2), tmpQ, tmpS); petalos.setMatrixAt(n++, tmpM);
      }
    }
    petalos.count = n; petalos.instanceMatrix.needsUpdate = true; expVer++;
  }

  // ---------- Detalles: neblina, hierba, hiedra, fuegos fatuos, ojos, aparición, gatos ----------
  // Tumba final: tres lugares frente a ella, en fila, mirándola (para los gatos)
  let tumbaF = null;
  if (tz) {
    const [fx, fy] = tz.f, cx = (tz.x + .5) * C, cz = (tz.y + .5) * C, k = C / 2 + 0.55, lx = -fy, lz = fx;
    tumbaF = { face: Math.atan2(-fx, -fy), spots: [-0.55, 0, 0.55].map(o => [cx + fx * k + lx * o, cz + fy * k + lz * o]) };
  }
  // La vela de la tumba final se enciende sola cuando los tres gatos se acuestan
  function encenderTumba() { if (!tz || tz.encendida) return; tz.encendida = true; tz.tEnc = 0; tz.llama.visible = true; expVer++; dirty = true; }
  // Rayo sobre la tumba final: un trazo quebrado del cielo a la vela, doble destello que ilumina todo,
  // trueno y sacudida. La vela queda encendida con el golpe. El blanco que ciega la pantalla lo pone la UI (evento "acostados").
  let rayoT = -1, rayoObj = null;
  const flashK = t => t < 0.06 ? 1 : t < 0.14 ? 0.35 : t < 0.24 ? 0.9 : 0.9 * Math.exp(-(t - 0.24) * 4.2);
  function rayo() {
    if (!tz) return;
    const Rr = rng(Math.floor(performance.now())), x0 = tz.luzPos.x, z0 = tz.luzPos.z, pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, j = (1 - u) * 2.6 + 0.15; pts.push(new THREE.Vector3(x0 + (Rr() - .5) * j * (i ? 1 : 2), 34 * (1 - u) + 0.45 * u, z0 + (Rr() - .5) * j * (i ? 1 : 2))); }
    pts[16].set(x0, 0.42, z0);
    const ramal = [pts[7].clone()]; for (let i = 1; i <= 5; i++) ramal.push(ramal[i - 1].clone().add(new THREE.Vector3((Rr() - .3) * 1.4, -1.6 - Rr(), (Rr() - .5) * 1.4)));
    const tubo = (p, r) => { const cp = new THREE.CurvePath(); for (let i = 0; i < p.length - 1; i++) cp.add(new THREE.LineCurve3(p[i], p[i + 1])); return new THREE.TubeGeometry(cp, p.length * 3, r, 5, false); };
    const mat = (op) => new THREE.MeshBasicMaterial({ color: 0xe6eeff, transparent: true, opacity: op, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    rayoObj = new THREE.Group(); rayoObj.name = 'rayo';
    [[pts, 0.035, 1], [pts, 0.16, 0.22], [ramal, 0.02, 0.8]].forEach(([p, r, op]) => rayoObj.add(new THREE.Mesh(tubo(p, r), mat(op))));
    scene.add(rayoObj); rayoT = 0; shake = 1.4; encenderTumba(); dirty = true;
    if (sfx && sfx.trueno) sfx.trueno();
  }
  function quitarRayo() { if (!rayoObj) return; rayoObj.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); scene.remove(rayoObj); rayoObj = null; }
  function apagarTumba() { if (!tz) return; tz.encendida = false; tz.llama.visible = false; expVer++; dirty = true; }
  const deco = crearDeco({ scene, mapa, cam, P, linea, sfx, tema, sinHierba: cem && cem.sinHierba, paredes: cem && cem.paredes, huecos: cem && cem.huecos, calidad: coarse ? 'baja' : 'alta', reducido: matchMedia('(prefers-reduced-motion: reduce)').matches, encargos: json.encargos || [], estadoEnc: estadoEncargos,
    tumba: tumbaF, alEvento: e => { if (e === 'acostados') rayo(); else if (e === 'acostadosYa') encenderTumba(); else if (e === 'reset') apagarTumba(); on.evento?.(e); } });
  // Lo interactuable que las velas deben evitar: lápidas, puerta, reja, encargos y el inicio
  const evitar = [...objetivos.map(o => [o.fp.x, o.fp.z]), ...deco.encargos.map(e => [e.x, e.z]), [mapa.inicio.x, mapa.inicio.z]];
  const cirios = crearVelas({ scene, mapa, P, linea, defs: json.velas || [], huecos: cem ? cem.huecos : [], evitar, encendidas: estadoVelas, sfx, luces: coarse ? 0 : 2, reducido: matchMedia('(prefers-reduced-motion: reduce)').matches });
  // Pistas del misterio (foto en 4 pedazos y caja de música), lejos de todo lo demás
  const pistas = crearPistas({ scene, mapa, P, linea, defs: json.pistas || {}, evitar: [...evitar, ...cirios.lista.map(v => [v.x, v.z])], estado: estadoPistas, sfx,
    reducido: matchMedia('(prefers-reduced-motion: reduce)').matches, onFoto: () => on.foto?.() });
  if (pistas.caja && pistas.caja.estado === 'entregada') { const t = mapa.tumbas.find(x => x.id === pistas.caja.tumba); if (t) pistas.colocarCajaEn(t.obj); }

  // ---------- Entrada ----------
  const keys = new Set();
  let paused = true, locked = false, sinLock = false, acc = 0, dirty = true;
  let joyS = { id: null }, lookS = { id: null };
  const lockEl = renderer.domElement;

  function paso(dir) { P.yaw -= dir * (ajustes.pasoGrados || 45) * D2R; acc = 0; on.paso?.(dir); }
  function interactuar() { if (!paused && objetivo) on.interactuar?.(objetivo); }
  // Sin Pointer Lock (p. ej. dentro de un iframe que no lo permite) se mira arrastrando con el mouse
  function fallaLock() { if (sinLock) return; sinLock = true; on.bloqueoFallido?.(); }
  function bloquear() {
    if (coarse || locked || sinLock) return;
    try { const r = lockEl.requestPointerLock(); if (r && r.catch) r.catch(fallaLock); } catch (e) { fallaLock(); }
  }
  const enControl = t => t && t.closest && t.closest('input,button,select,textarea,a,[role="dialog"]');
  function onKey(e) {
    if (e.type === 'keyup') { keys.delete(e.code); return; }
    if (paused || enControl(e.target)) return;
    const k = e.code;
    if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
    if (k === 'KeyE' || k === 'Enter' || k === 'Space') { if (!e.repeat) interactuar(); return; }
    if (ajustes.giro === 'pasos' && !e.repeat && (k === 'ArrowLeft' || k === 'ArrowRight')) paso(k === 'ArrowLeft' ? -1 : 1);
    keys.add(k);
  }
  function onMouse(e) {
    if (!locked || paused) return;
    const s = 0.0022 * (ajustes.sensibilidad || 1);
    if (ajustes.giro === 'pasos') { acc += e.movementX; if (Math.abs(acc) > 110) paso(Math.sign(acc)); }
    else P.yaw -= e.movementX * s;
    P.pitch -= e.movementY * s * (ajustes.invertirY ? -1 : 1); clampPitch();
  }
  function onLockChange() {
    const l = document.pointerLockElement === lockEl;
    if (locked && !l) { acc = 0; keys.clear(); on.desbloqueo?.(); }
    locked = l; on.bloqueo?.(l);
  }
  const JOY_R = 52;
  function onDown(e) {
    if (paused) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      if (locked) { interactuar(); return; }
      bloquear();
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      lookS = { id: e.pointerId, lx: e.clientX, ly: e.clientY, t0: performance.now(), moved: 0, mouse: true };
      return;
    }
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    if (e.clientX < innerWidth * 0.45 && joyS.id === null) {
      joyS = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      if (joy) { joy.base.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; joy.knob.style.transform = 'translate(0,0)'; joy.base.classList.add('on'); }
      on.toque?.('mover');
    } else if (lookS.id === null) {
      lookS = { id: e.pointerId, lx: e.clientX, ly: e.clientY, t0: performance.now(), moved: 0 };
      on.toque?.('mirar');
    }
  }
  function onMove(e) {
    if (e.pointerId === joyS.id) {
      let dx = e.clientX - joyS.ox, dy = e.clientY - joyS.oy; const len = Math.hypot(dx, dy);
      if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
      joyS.x = dx / JOY_R; joyS.y = dy / JOY_R;
      if (joy) joy.knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === lookS.id && !paused) {
      if (lookS.mouse && locked) return;
      const dx = e.clientX - lookS.lx, dy = e.clientY - lookS.ly; lookS.lx = e.clientX; lookS.ly = e.clientY; lookS.moved += Math.abs(dx) + Math.abs(dy);
      const s = (lookS.mouse ? 0.0045 : 0.006) * (ajustes.sensibilidad || 1);
      if (ajustes.giro === 'pasos') { acc += dx; if (Math.abs(acc) > 70) paso(Math.sign(acc)); }
      else P.yaw -= dx * s;
      P.pitch -= dy * s * (ajustes.invertirY ? -1 : 1); clampPitch();
    }
  }
  function onUp(e) {
    if (e.pointerId === joyS.id) { joyS = { id: null }; if (joy) joy.base.classList.remove('on'); }
    else if (e.pointerId === lookS.id) {
      if (e.type === 'pointerup' && lookS.moved < 12 && performance.now() - lookS.t0 < 350 && (!lookS.mouse || sinLock)) interactuar();
      lookS = { id: null }; acc = 0;
    }
  }
  const onBlur = () => keys.clear();
  addEventListener('keydown', onKey); addEventListener('keyup', onKey); addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouse); document.addEventListener('pointerlockchange', onLockChange); document.addEventListener('pointerlockerror', fallaLock);
  stage.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);

  // ---------- Objetivo al alcance ----------
  let objetivo = null;
  function buscarObjetivo() {
    let best = null, bd = ALCANCE; const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (const lista of [objetivos, deco.objetivos(), cirios.objetivos(), pistas.objetivos()]) for (const t of lista) {
      const dx = t.p.x - P.x, dz = t.p.z - P.z, d = Math.hypot(dx, dz);
      if (d > bd || (dx * fx + dz * fz) / (d || 1) < 0.8 || !linea(P.x, P.z, t.fp.x, t.fp.z)) continue;
      best = t; bd = d;
    }
    if (best !== objetivo) { objetivo = best; on.objetivo?.(best); }
  }

  // ---------- Bucle ----------
  let luzActual = LUZ.noche; const tmpCol = new THREE.Color();
  let shake = 0, lunaBase = LUZ.noche.luna, aimYaw = P.yaw, aimPitch = 0, T = 0, fpsAcc = 0, fpsN = 0, fps = 0, expT = 0;
  function mover(dt) {
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD')) s += 1;
    if (keys.has('KeyA')) s -= 1;
    if (ajustes.giro !== 'pasos') P.yaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * 2.1 * dt;
    if (joyS.id !== null && Math.hypot(joyS.x, joyS.y) > 0.12) { f -= joyS.y; s += joyS.x; }
    const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const tx = (-sy * f + cy * s) * VEL, tz = (-cy * f - sy * s) * VEL, k = 1 - Math.exp(-14 * dt);
    P.vx += (tx - P.vx) * k; P.vz += (tz - P.vz) * k;
    const dx = P.vx * dt, dz = P.vz * dt, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
    for (let i = 0; i < n; i++) { P.x += dx / n; resolver(); P.z += dz / n; resolver(); }
  }
  function frame(dt) {
    fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (paused && !dirty) return;
    dirty = false; T += paused ? 0 : dt;
    if (!paused) {
      mover(dt); buscarObjetivo();
      if ((expT += dt) > 0.15) { expT = 0; explorar(); }
      if (rutaOn) trazarRuta();
    }
    cam.position.set(P.x, OJO, P.z); cam.rotation.set(P.pitch, P.yaw, 0);
    if (shake > 0.01) { cam.position.x += (Math.random() - .5) * shake * 0.05; cam.position.y += (Math.random() - .5) * shake * 0.03; shake *= Math.exp(-7 * dt); dirty = true; }
    if (!paused) { deco.update(dt, T); cirios.update(dt, T); pistas.update(dt, T, cam); if (cem) cem.update(T, dt); }
    cielo.position.copy(cam.position);
    lunaM.position.copy(cam.position).addScaledVector(lunaDir, 44); lunaM.lookAt(cam.position);
    halo.position.copy(cam.position).addScaledVector(lunaDir, 45); halo.lookAt(cam.position);
    nubes.position.copy(cam.position); let cub = 0;
    nubeArr.forEach(mm => {
      const u = mm.userData; if (!paused) u.az += u.v * dt;
      const ce = Math.cos(u.el); mm.position.set(ce * Math.sin(u.az) * 44, Math.sin(u.el) * 44, -ce * Math.cos(u.az) * 44); mm.lookAt(cam.position);
      tmpN.copy(mm.position).normalize(); const ang = Math.acos(clamp(tmpN.dot(lunaDir), -1, 1)), hw = Math.atan(u.w * 0.3 / 44);
      cub = Math.max(cub, (1 - clamp((ang - hw * 0.35) / (hw * 0.65), 0, 1)) * mm.material.opacity);
    });
    luna.intensity = lunaBase * (1 - 0.6 * cub); lunaM.material.color.copy(lunaCol).multiplyScalar(1 - 0.5 * cub); halo.material.opacity = 0.07 * (1 - 0.75 * cub);
    const kk = 1 - Math.exp(-10 * dt); aimYaw += (P.yaw - aimYaw) * kk; aimPitch += (P.pitch - aimPitch) * kk;
    linterna.target.position.set(clamp(P.yaw - aimYaw, -0.25, 0.25) * 4, -0.1 - clamp(P.pitch - aimPitch, -0.2, 0.2) * 4, -4);
    const cerca = [...mapa.lapidas.filter(l => l.sellada), ...(tz && tz.encendida ? [tz] : [])].map(l => [l, (l.p.x - P.x) ** 2 + (l.p.z - P.z) ** 2]).sort((a, b) => a[1] - b[1]);
    velas.forEach((v, i) => {
      const c = cerca[i];
      if (!c || c[1] > 100) { v.intensity = 0; return; }
      const fl = 0.82 + 0.1 * Math.sin(T * 11 + i * 2.1) + 0.08 * Math.sin(T * 23.7 + i);
      v.position.copy(c[0].luzPos); v.intensity = (cementerio ? 3.4 : 2.6) * fl;
    });
    mapa.lapidas.forEach((l, i) => l.llama.scale.set(1, 0.85 + 0.2 * Math.sin(T * 13 + i * 1.7), 1));
    if (tz && tz.glitchCv && (tz.gT -= dt) <= 0) { tz.gT = 0.06 + Math.random() * 0.1; dibujarGlitch(tz); }
    if (tz && tz.encendida) { tz.tEnc += dt; const k = tz.tEnc < 0.3 ? titileo(tz.tEnc) : 1; tz.llama.scale.set(1, Math.max(0.01, (0.85 + 0.2 * Math.sin(T * 13 + 9)) * k), 1); }
    if (luzPuerta) { const f = 0.9 + 0.1 * Math.sin(T * 7.3); luzPuerta.intensity = 6 * f; halosF.forEach(h => { h.material.opacity = 0.45 * f; }); }
    if (rayoT >= 0) {
      rayoT += dt; const k = flashK(rayoT), L = luzActual;
      if (rayoObj) rayoObj.visible = rayoT < 0.12 || (rayoT > 0.16 && rayoT < 0.3);
      hemi.intensity = L.hemi + k * 4.5; luna.intensity += k * 3; scene.fog.far = L.far + k * 40; scene.fog.near = L.near + k * 10;
      scene.background.setHex(L.bg).lerp(tmpCol.setHex(0x9aa4c0), k * 0.6); scene.fog.color.copy(scene.background);
      if (rayoT > 0.32) quitarRayo();
      if (rayoT > 1.6) { rayoT = -1; hemi.intensity = L.hemi; scene.fog.far = L.far; scene.fog.near = L.near; scene.background.setHex(L.bg); scene.fog.color.setHex(L.bg); }
      dirty = true;
    }
    renderer.render(scene, cam);
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    cam.fov = clamp(2 * Math.atan(Math.tan(40 * D2R) / cam.aspect) / D2R, 60, 88); cam.updateProjectionMatrix(); dirty = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();
  explorar(true);

  // ---------- Minimapa: norte arriba, fog of war, ruta ----------
  let base = null, baseKey = '', marcadores = false;
  const COL = { muro: cementerio ? '#1d231c' : '#2b2c31', piso: cementerio ? '#66625a' : '#5a5b62', niebla: 'rgba(8,9,12,0)', lapida: '#a8443a', sellada: '#efd9a6', puerta: '#e0443a', ruta: '#e8902a', yo: '#ffffff' };
  function dibujarMinimapa(ctx, S, { completo = false, centro = null } = {}) {
    const s = S / Math.max(W, H), key = S + '|' + expVer + '|' + completo + '|' + mapa.lapidas.map(l => +l.sellada).join('') + (tz && tz.encendida ? 'T' : '');
    if (!base || baseKey !== key) {
      baseKey = key; base = base || document.createElement('canvas'); base.width = base.height = S; const g = base.getContext('2d');
      g.clearRect(0, 0, S, S);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!completo && !exp[y * W + x]) continue;
        const c = at(x, y);
        g.fillStyle = c === '#' || c === 'M' || (tz && x === tz.x && y === tz.y) ? COL.muro : COL.piso; g.fillRect(x * s, y * s, s + .5, s + .5);
      }
      if (tz && tz.encendida && (completo || exp[tz.y * W + tz.x])) { g.fillStyle = COL.sellada; g.beginPath(); g.arc((tz.x + .5) * s, (tz.y + .5) * s, s * 0.36, 0, 6.29); g.fill(); }
      for (const l of mapa.tumbas) { if (!completo && !exp[l.y * W + l.x]) continue; g.fillStyle = '#8d877b'; g.beginPath(); g.arc((l.x + .5) * s, (l.y + .5) * s, s * 0.3, 0, 6.29); g.fill(); }
      for (const l of mapa.lapidas) {
        if (!completo && !exp[l.y * W + l.x]) continue;
        g.fillStyle = l.sellada ? COL.sellada : COL.lapida; g.beginPath(); g.arc((l.x + .5) * s, (l.y + .5) * s, s * 0.36, 0, 6.29); g.fill();
      }
      if (pz) { g.fillStyle = COL.puerta; g.fillRect(pz.x * s + s * .12, pz.y * s + s * .12, s * .76, s * .76); }
      if (ruta.length > 1) {
        g.strokeStyle = COL.ruta; g.lineWidth = Math.max(1.5, s * 0.22); g.setLineDash([s * 0.35, s * 0.35]); g.lineCap = 'round';
        g.beginPath(); ruta.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, (x + .5) * s, (y + .5) * s));
        if (pz) g.lineTo((pz.x + .5) * s, (pz.y + .5) * s); g.stroke(); g.setLineDash([]);
      }
    }
    ctx.clearRect(0, 0, S, S); ctx.drawImage(base, 0, 0);
    // Pruebas: objetos escondidos (cuadro) y gatos (punto), con el color de cada uno
    if (marcadores) {
      const COLE = { van: '#6f9ee8', carey: '#f3efe4', tuxedo: '#ffd166' }, r = Math.max(3, s * 0.32);
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      deco.encargos.forEach(e => { if (e.estado !== 'escondido') return; ctx.fillStyle = COLE[e.gato] || '#fff'; ctx.fillRect(e.x / C * s - r, e.z / C * s - r, r * 2, r * 2); ctx.strokeRect(e.x / C * s - r, e.z / C * s - r, r * 2, r * 2); });
      pistas.piezas.forEach(o => { if (o.estado !== 'escondido') return; ctx.fillStyle = '#e8ddc6'; ctx.fillRect(o.x / C * s - r * .7, o.z / C * s - r * .7, r * 1.4, r * 1.4); ctx.strokeRect(o.x / C * s - r * .7, o.z / C * s - r * .7, r * 1.4, r * 1.4); });
      if (pistas.caja && pistas.caja.estado === 'escondido') { const o = pistas.caja; ctx.fillStyle = '#b07a48'; ctx.beginPath(); ctx.moveTo(o.x / C * s, o.z / C * s - r); ctx.lineTo(o.x / C * s + r, o.z / C * s); ctx.lineTo(o.x / C * s, o.z / C * s + r); ctx.lineTo(o.x / C * s - r, o.z / C * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      deco.gatos.forEach(g => { if (g.estado === 'oculto') return; ctx.fillStyle = COLE[g.tipo] || '#fff'; ctx.beginPath(); ctx.arc(g.x / C * s, g.z / C * s, r * 0.85, 0, 6.29); ctx.fill(); ctx.stroke(); });
    }
    ctx.save(); ctx.translate(P.x / C * s, P.z / C * s); ctx.rotate(-P.yaw);
    ctx.fillStyle = COL.yo; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5;
    const a = Math.max(4, s * .6);
    ctx.beginPath(); ctx.moveTo(0, -a); ctx.lineTo(a * .66, a * .7); ctx.lineTo(0, a * .35); ctx.lineTo(-a * .66, a * .7); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  return {
    scene, cam, mapa, frame, resize, dibujarMinimapa, bloquear,
    get bloqueado() { return locked; },
    get ruta() { return rutaOn; },
    pausar(v) { paused = !!v; dirty = true; keys.clear(); acc = 0; joyS = { id: null }; lookS = { id: null }; joy?.base.classList.remove('on'); if (v) { P.vx = P.vz = 0; } },
    // Lápida resuelta (l.sellada = ya ganaste su sello): se quita el sello de cera y se enciende la vela
    setSellada(id, on) {
      const l = mapa.lapidas.find(x => x.id === id); if (!l || l.sellada === !!on) return;
      l.sellada = !!on; l.llama.visible = !!on; l.vela.visible = true; l.cabo.visible = false; l.sello.visible = !on;
      dirty = true; expVer++;
    },
    sacudirReja() { const n = cem ? cem.sacudirReja() : 1; shake = Math.min(1.6, 0.6 + n * 0.25); dirty = true; return n; },
    setDeco(v) { deco.grupo.visible = !!v; dirty = true; },
    forzar(cosa) { deco.forzar(cosa); dirty = true; },
    // Final de los gatos: el último en recibir su objeto guía al jugador a la tumba final
    iniciarFinal(tipo) { deco.iniciarFinal(tipo); dirty = true; },
    ajustarEncargos(c) { const r = deco.ajustarEncargos(c); dirty = true; return r; },
    setMarcadores(v) { marcadores = !!v; },
    forzarFinal() { const ids = deco.forzarFinal(); dirty = true; return ids; },
    rayo() { rayo(); },
    // Encargos de los gatos: objetos escondidos en pasillos sin salida (mapa.json → "encargos")
    get encargos() { return deco.encargos; },
    recoger(id) { deco.recoger(id); dirty = true; },
    entregar(id) { deco.entregar(id); dirty = true; },
    acariciar(tipo) { deco.acariciar(tipo); dirty = true; },
    resetEncargos() { deco.resetEncargos(); dirty = true; },
    modeloEncargo(id) { return deco.modelo(id); },
    get velas() { return cirios.lista; },
    get pistas() { return pistas; },
    recogerPista(id) { pistas.recoger(id); dirty = true; },
    dejarCaja(tumbaId) { const t = mapa.tumbas.find(x => x.id === tumbaId); if (t) pistas.dejarCaja(t.obj); dirty = true; },
    resetPistas() { pistas.reset(); dirty = true; },
    modeloPista(id) { return pistas.modelo(id); },
    ajustarPistas(c) { pistas.ajustar(c); },
    encenderVela(id) { cirios.encender(id); dirty = true; },
    apagarVelas() { cirios.apagar(); dirty = true; },
    // Pruebas: pararse a ~1,5 m de un punto, mirándolo, en el primer lado libre con línea de vista
    mirarA(x, z, dist = 1.5) {
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, px = x + Math.sin(a) * dist, pz = z + Math.cos(a) * dist;
        if (solido(Math.floor(px / C), Math.floor(pz / C)) || !linea(px, pz, x, z)) continue;
        Object.assign(P, { x: px, z: pz, yaw: Math.atan2(px - x, pz - z), pitch: -0.45, vx: 0, vz: 0 }); aimYaw = P.yaw; rutaDesde = ''; dirty = true; return true;
      }
      return false;
    },
    setRuta(v) { rutaOn = !!v; rutaDesde = ''; trazarRuta(); dirty = true; return rutaOn; },
    setAjustes(a) { Object.assign(ajustes, a); clampPitch(); dirty = true; },
    setLuz(modo) {
      const L = LUZ[modo] || LUZ.noche; luzActual = L;
      scene.background.setHex(L.bg); scene.fog.color.setHex(L.bg); scene.fog.near = L.near; scene.fog.far = L.far;
      hemi.intensity = L.hemi; luna.intensity = lunaBase = L.luna; linterna.intensity = L.lin; pintarCielo(L.cielo[0], L.cielo[1]); dirty = true;
    },
    setLinterna(k) { linterna.intensity = LUZ.noche.lin * k; dirty = true; },
    // Pruebas: tamaño del haz en grados e intensidad en % de 28 (escala de la entrada)
    ajustarLinterna({ grados, pct, alcance, borde } = {}) {
      if (grados != null) linterna.angle = clamp(grados, 3, 60) * D2R;
      if (pct != null) { LUZ.noche.lin = 28 * pct / 100; linterna.intensity = LUZ.noche.lin; }
      if (alcance != null) linterna.distance = alcance;
      if (borde != null) linterna.penumbra = clamp(borde / 100, 0, 1);
      dirty = true;
      return { grados: Math.round(linterna.angle / D2R), pct: Math.round(LUZ.noche.lin / 28 * 100), alcance: Math.round(linterna.distance), borde: Math.round(linterna.penumbra * 100) };
    },
    explorado: serializarExplorado,
    reiniciar() { Object.assign(P, { x: mapa.inicio.x, z: mapa.inicio.z, yaw: mapa.inicio.yaw, pitch: 0, vx: 0, vz: 0 }); aimYaw = P.yaw; rutaDesde = ''; dirty = true; },
    olvidar() { exp.fill(0); expVer++; explorar(); dirty = true; },
    ponerEn(cx, cy, yaw, pitch = 0) { Object.assign(P, { x: (cx + .5) * C, z: (cy + .5) * C, yaw, pitch, vx: 0, vz: 0 }); aimYaw = yaw; rutaDesde = ''; dirty = true; },
    // Pruebas: pararse frente a una lápida o la puerta (distancia en celdas desde el borde)
    irA(t, dist = 0.4) {
      const x = (t.x + .5 + t.f[0] * (.5 + dist)) * C, z = (t.y + .5 + t.f[1] * (.5 + dist)) * C;
      Object.assign(P, { x, z, yaw: Math.atan2(t.f[0], t.f[1]), pitch: -0.12, vx: 0, vz: 0 }); aimYaw = P.yaw; rutaDesde = ''; dirty = true;
    },
    estado() {
      return { x: P.x, z: P.z, yaw: P.yaw, celda: celdaP(), fps, objetivo, bloqueado: locked,
        rumbo: Math.round(((-P.yaw / D2R) % 360 + 360) % 360), explorado: fraccionExplorada() };
    },
    dispose() {
      removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouse); document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('pointerlockerror', fallaLock);
      stage.removeEventListener('pointerdown', onDown); stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp); stage.removeEventListener('pointercancel', onUp);
      ro.disconnect(); petalos.dispose(); deco.dispose(); cirios.dispose(); pistas.dispose(); if (cem) cem.dispose(); disposables.forEach(d => d.dispose());
    },
  };
}
