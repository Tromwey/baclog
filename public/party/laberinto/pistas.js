// Pistas del misterio: una fotografía rota en 4 pedazos (uno por cuadrante del mapa) y una caja de música
// que se oye a lo lejos y hay que dejar en la tumba correcta. mapa.json → "pistas".
// La foto se carga de laberinto/<pistas.foto.src>; si no existe, se usa un marcador.
import * as THREE from '../vendor/three.module.min.js';

const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const PW = 256, PH = 192;   // tamaño de cada pedazo en su canvas (la foto completa es 512×384, 4:3)

export function crearPistas({ scene, mapa, P, linea, defs = {}, evitar = [], estado = {}, sfx = null, reducido = false, onFoto = null }) {
  const { W, H, C, at, solido } = mapa;
  const grupo = new THREE.Group(); grupo.name = 'pistas'; scene.add(grupo);
  const lib = [], keep = o => (lib.push(o), o);
  let semilla = 4243; const R = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const CFG = { aros: true, alcance: 8, destello: true };
  const fotoD = defs.foto || null, cajaD = defs.caja || null;

  // ---------- Ubicación: lo más lejos posible de todo lo interactuable ----------
  const usados = evitar.map(p => [p[0], p[1]]);
  const lejos = (x, z) => usados.reduce((m, [ux, uz]) => Math.min(m, Math.hypot(x - ux, z - uz)), 1e9);
  const pisos = []; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (!solido(x, y)) pisos.push([x, y]);
  function lugarEn(celdas, meter) {
    let b = null, bd = -1; celdas.forEach(([x, y]) => { const d = lejos((x + .5) * C, (y + .5) * C); if (d > bd) { bd = d; b = [x, y]; } });
    if (!b) return null;
    const [x, y] = b, lados = N4.filter(([dx, dy]) => at(x + dx, y + dy) === '#'), [dx, dy] = lados.length ? lados[Math.floor(R() * lados.length)] : [0, 0];
    const p = [(x + .5) * C + dx * meter + dy * (R() - .5) * 0.5, (y + .5) * C + dy * meter + dx * (R() - .5) * 0.5]; usados.push(p); return p;
  }

  // ---------- Fotografía ----------
  const img = new Image(); let fotoLista = false;
  const marcador = (() => {   // sin foto: papel sepia con rayas y un rótulo, para que se note que falta
    const c = document.createElement('canvas'); c.width = 512; c.height = 384; const g = c.getContext('2d');
    g.fillStyle = '#b39a76'; g.fillRect(0, 0, 512, 384);
    for (let i = -384; i < 512; i += 14) { g.strokeStyle = 'rgba(90,68,44,.18)'; g.lineWidth = 6; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 384, 384); g.stroke(); }
    g.fillStyle = 'rgba(52,38,26,.75)'; g.font = '600 22px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FOTO DE LA FIESTA', 256, 180); g.font = '500 14px ui-monospace, Menlo, monospace'; g.fillText('laberinto/foto.jpg', 256, 210);
    return c;
  })();
  // Costuras rasgadas compartidas: cada orilla interna es la MISMA línea para los dos pedazos que separa,
  // así encajan sin hueco. Coordenadas de la foto completa (512×384); todas pasan por el mismo centro.
  const FW = PW * 2, FH = PH * 2, PAD = 12;
  const costuras = (() => {
    let s = 2027; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647), j = a => (r() - .5) * a;
    const cc = [FW / 2 + j(10), FH / 2 + j(8)];
    const tramo = (a, b, n, perpX) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; return i === 0 || i === n ? [x, y] : perpX ? [x + j(14), y] : [x, y + j(14)]; });
    return {
      vt: tramo([FW / 2 + j(10), 0], cc, 10, true), vb: tramo(cc, [FW / 2 + j(10), FH], 10, true),
      hl: tramo([0, FH / 2 + j(8)], cc, 12, false), hr: tramo(cc, [FW, FH / 2 + j(8)], 12, false),
    };
  })();
  const { vt, vb, hl, hr } = costuras, rev = a => a.slice().reverse(), ult = a => a[a.length - 1];
  const CONTORNO = [
    [[0, 0], ...vt, ...rev(hl)],                                   // arriba izq.
    [vt[0], [FW, 0], ult(hr), ...rev(hr), ...rev(vt)],             // arriba der.
    [...hl, ...vb, [0, FH]],                                       // abajo izq.
    [...hr, [FW, FH], ...rev(vb)],                                 // abajo der.
  ];
  function pintarPieza(pz) {
    const g = pz.cv.getContext('2d'), q = pz.q, qx = q % 2, qy = q >> 1, fuente = fotoLista ? img : marcador;
    const iw = fuente.naturalWidth || fuente.width, ih = fuente.naturalHeight || fuente.height;
    let sw = iw, sh = iw * 3 / 4; if (sh > ih) { sh = ih; sw = ih * 4 / 3; }      // recorte 4:3 desde el centro
    const ox = (iw - sw) / 2, oy = (ih - sh) / 2, b = 12;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pz.cv.width, pz.cv.height); g.save();
    g.translate(PAD - qx * PW, PAD - qy * PH);
    g.beginPath(); CONTORNO[q].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
    g.fillStyle = '#ece4d2'; g.fillRect(0, 0, FW, FH);                                // margen blanco de foto vieja (solo por fuera)
    g.drawImage(fuente, ox, oy, sw, sh, b, b, FW - b * 2, FH - b * 2);
    g.fillStyle = 'rgba(120,88,46,.16)'; g.fillRect(0, 0, FW, FH);                    // tono viejo
    g.restore();
    pz.tex.needsUpdate = true;
  }
  const PAPEL = keep(new THREE.PlaneGeometry(0.24 * (PW + PAD * 2) / PW, 0.18 * (PH + PAD * 2) / PH).rotateX(-Math.PI / 2));
  const piezas = (fotoD ? [0, 1, 2, 3] : []).map(q => {
    const qx = q % 2, qy = q >> 1, celdas = pisos.filter(([x, y]) => (x < W / 2) === !qx && (y < H / 2) === !qy);
    const [x, z] = lugarEn(celdas, 0.5) || [(P.x), (P.z)];
    const cv = document.createElement('canvas'); cv.width = PW + PAD * 2; cv.height = PH + PAD * 2;
    const tex = keep(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = keep(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    const obj = new THREE.Group(); obj.name = 'foto_' + (q + 1);
    const m = new THREE.Mesh(PAPEL, mat); m.position.y = 0.012; m.rotation.set((R() - .5) * 0.12, 0, (R() - .5) * 0.12); obj.add(m);
    obj.position.set(x, 0, z); obj.rotation.y = R() * 6.28; grupo.add(obj);
    const id = 'foto' + (q + 1), pz = { id, tipo: 'pieza', q, cv, tex, mat, obj, x, z, y0: 0, p: new THREE.Vector3(x, 0.05, z), fp: new THREE.Vector3(x, 0, z), estado: estado[id] ? 'llevas' : 'escondido', saca: 0, ph: R() * 6.28, cerca: false, cercaT: 0, ve: false, veT: 0, gy: 0.06 };
    pintarPieza(pz); if (pz.estado !== 'escondido') obj.visible = false;
    return pz;
  });
  if (fotoD) {
    img.onload = () => { fotoLista = true; piezas.forEach(pintarPieza); onFoto && onFoto(); };
    img.src = new URL(fotoD.src || 'foto.jpg', import.meta.url).href;
  }
  // Foto armada con los pedazos que se tienen (para el inventario y la pantalla final)
  function componerFoto(cv, todos = false) {
    const g = cv.getContext('2d'), sx = cv.width / (PW * 2), sy = cv.height / (PH * 2);
    g.clearRect(0, 0, cv.width, cv.height);
    piezas.forEach(pz => { if (todos || pz.estado !== 'escondido') g.drawImage(pz.cv, ((pz.q % 2) * PW - PAD) * sx, ((pz.q >> 1) * PH - PAD) * sy, (PW + PAD * 2) * sx, (PH + PAD * 2) * sy); });
    return cv;
  }

  // ---------- Caja de música ----------
  const MAD = keep(new THREE.MeshLambertMaterial({ color: 0x6b4329 })), MADO = keep(new THREE.MeshLambertMaterial({ color: 0x4a2c1a })),
    ORO = keep(new THREE.MeshLambertMaterial({ color: 0xc9a04a })), FORRO = keep(new THREE.MeshLambertMaterial({ color: 0x7e2a2a }));
  const CAJA = keep(new THREE.BoxGeometry(1, 1, 1)), CIL = keep(new THREE.CylinderGeometry(1, 1, 1, 10));
  const pieza = (par, geo, mat, p, s, r) => { const o = new THREE.Mesh(geo, mat); o.position.set(p[0], p[1], p[2]); o.scale.set(s[0], s[1], s[2]); if (r) o.rotation.set(r[0], r[1], r[2]); par.add(o); return o; };
  function crearCaja() {
    const g = new THREE.Group(); g.name = 'caja_musica';
    pieza(g, CAJA, MAD, [0, 0.04, 0], [0.15, 0.072, 0.1]);
    pieza(g, CAJA, FORRO, [0, 0.074, 0], [0.135, 0.004, 0.085]);
    [[0, 0.004, 0.051], [0, 0.004, -0.051]].forEach(p => pieza(g, CAJA, ORO, p, [0.152, 0.008, 0.004]));
    pieza(g, CIL, ORO, [0.02, 0.08, -0.01], [0.012, 0.06, 0.012], [0, 0, Math.PI / 2]);        // cilindro de púas
    const tapa = new THREE.Group(); tapa.position.set(0, 0.076, -0.05); tapa.rotation.x = -1.15; g.add(tapa);
    pieza(tapa, CAJA, MADO, [0, 0.006, 0.05], [0.15, 0.012, 0.1]);
    pieza(tapa, CAJA, ORO, [0, -0.001, 0.05], [0.11, 0.002, 0.07]);                           // espejo / placa
    pieza(g, CIL, ORO, [0.083, 0.04, 0], [0.006, 0.02, 0.006], [0, 0, Math.PI / 2]);            // llave de cuerda
    pieza(g, CAJA, ORO, [0.095, 0.04, 0], [0.004, 0.03, 0.012]);
    return g;
  }
  let caja = null;
  if (cajaD) {
    const [x, z] = lugarEn(pisos, 0.55) || [P.x, P.z];
    const obj = crearCaja(); obj.position.set(x, 0, z); obj.rotation.y = R() * 6.28; grupo.add(obj);
    caja = { id: 'caja', tipo: 'caja', ...cajaD, obj, x, z, y0: 0, p: new THREE.Vector3(x, 0.08, z), fp: new THREE.Vector3(x, 0, z), estado: estado.caja || 'escondido', saca: 0, ph: R() * 6.28, cerca: false, cercaT: 0, ve: false, veT: 0, gy: 0.12, tMel: 3 };
    if (caja.estado !== 'escondido') obj.visible = false;
  }

  // ---------- Señales: aros en el suelo y destello con la linterna (como los encargos) ----------
  const ARO = keep(new THREE.RingGeometry(0.2, 0.235, 40).rotateX(-Math.PI / 2));
  const glow = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)); })();
  const todos = [...piezas, ...(caja ? [caja] : [])];
  todos.forEach(o => {
    o.aros = [0, 1].map(() => { const m = new THREE.Mesh(ARO, keep(new THREE.MeshBasicMaterial({ color: 0xf0b060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))); m.renderOrder = 5; m.visible = false; m.position.set(o.x, 0.016, o.z); grupo.add(m); return m; });
    o.glint = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })));
    o.glint.position.set(o.x, o.gy, o.z); o.glint.renderOrder = 5; grupo.add(o.glint);
  });
  const panDe = (x, z) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1; return clamp((dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / d, -1, 1) * 0.85; };
  const fw = new THREE.Vector3();

  function update(dt, T, cam) {
    if (cam) cam.getWorldDirection(fw);
    todos.forEach(o => {
      if (o.saca > 0) { o.saca += dt; o.obj.scale.setScalar(Math.max(0.001, 1 - sstep(0, 0.3, o.saca))); o.obj.position.y = o.y0 + o.saca * 0.5; if (o.saca > 0.3) { o.saca = 0; o.obj.visible = false; } }
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
    // La caja se oye: escondida, a lo lejos y con su lado (izq./der.); ya entregada, bajito cerca de su tumba
    if (caja && caja.estado !== 'llevas' && sfx && sfx.cajita && (caja.tMel -= dt) <= 0) {
      const esc = caja.estado === 'escondido', alc = esc ? 18 : 9, x = caja.obj.position.x, z = caja.obj.position.z, d = Math.hypot(x - P.x, z - P.z);
      caja.tMel = esc ? 11 + R() * 5 : 20 + R() * 8;
      if (d < alc) sfx.cajita(Math.pow(1 - d / alc, 1.4) * (esc ? 1 : 0.6), panDe(x, z));
    }
  }
  function objetivos() { return todos.filter(o => o.estado === 'escondido' && !o.saca); }
  function recoger(id) { const o = todos.find(x => x.id === id); if (!o || o.estado !== 'escondido') return; o.estado = 'llevas'; o.saca = 0.001; o.aros.forEach(a => { a.visible = false; }); o.glint.material.opacity = 0; }
  // Deja la caja sobre la tumba (en el montículo, a un lado de la losa) y la hace sonar completa
  function dejarCaja(tumbaObj) {
    if (!caja || caja.estado !== 'llevas' || !tumbaObj) return;
    caja.estado = 'entregada'; caja.saca = 0;
    const p = new THREE.Vector3(-0.22, 0.12, 0.12).applyMatrix4(tumbaObj.matrixWorld);
    caja.obj.position.copy(p); caja.obj.rotation.y = tumbaObj.rotation.y + 0.3; caja.obj.scale.setScalar(1); caja.obj.visible = true; caja.tMel = 22;
    if (sfx && sfx.cajita) sfx.cajita(1, panDe(p.x, p.z), 16);
  }
  function colocarCajaEn(tumbaObj) {   // al recargar con la caja ya entregada
    if (!caja || !tumbaObj) return; const p = new THREE.Vector3(-0.22, 0.12, 0.12).applyMatrix4(tumbaObj.matrixWorld);
    caja.obj.position.copy(p); caja.obj.rotation.y = tumbaObj.rotation.y + 0.3; caja.obj.visible = true; caja.tMel = 6;
  }
  function reset() {
    todos.forEach(o => { o.estado = 'escondido'; o.saca = 0; o.obj.visible = true; o.obj.scale.setScalar(1); o.obj.position.set(o.x, o.y0, o.z); o.cercaT = 0; });
  }
  function modelo(id) {
    if (id === 'caja') return crearCaja();
    const pz = piezas.find(x => x.id === id); if (!pz) return new THREE.Group();
    const g = new THREE.Group(), m = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.24 * (PW + PAD * 2) / PW, 0.18 * (PH + PAD * 2) / PH)), pz.mat); g.add(m); return g;
  }
  return {
    grupo, piezas, caja, medidas: { PW, PH, PAD }, objetivos, update, recoger, dejarCaja, colocarCajaEn, reset, modelo, componerFoto,
    get fotoLista() { return fotoLista; },
    ajustar(c = {}) { Object.assign(CFG, c); todos.forEach(o => { o.cercaT = 0; }); },
    dispose() { lib.forEach(o => o.dispose()); scene.remove(grupo); },
  };
}
