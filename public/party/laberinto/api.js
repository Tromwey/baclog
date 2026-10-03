// Cliente del servidor de sellos. Sin `base` usa un mock local con el mismo contrato.
// El mock guarda su "base de datos" en localStorage['lab.servidor.v1'], separada de la caché del cliente (lab.v1).
const DB_KEY = 'lab.servidor.v1';
const espera = ms => new Promise(r => setTimeout(r, ms));
// Nombres en minúsculas, sin acentos (la ñ se conserva), sin signos y con un solo espacio
export const normalNombre = s => String(s || '').toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'ñ').replace(/[^a-zñ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Solo para pruebas: jugadores simulados en el marcador
const SIMULADOS = ['Calaca', 'Catrina', 'Panteonero', 'Veladora', 'Tecolote', 'Huesitos', 'Copal', 'Sombra', 'Ánima', 'Xolo', 'La Llorona', 'Cempasúchil'];

export class ErrorApi extends Error {
  constructor(status, body) { super((body && body.error) || 'http ' + status); this.status = status; this.body = body; }
}

function crearMock(lapidasValidas, nichos = [], ouija = null) {
  const leer = () => { try { return JSON.parse(localStorage.getItem(DB_KEY)) || { jugadores: {} }; } catch (_) { return { jugadores: {} }; } };
  const escribir = db => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const rnd = () => Math.random().toString(36).slice(2, 10);
  // Mausoleo: la suma de sellos entregados por todos abre los nichos. Solo se manda el contenido de los abiertos.
  const entregadosDe = j => Object.values(j.sellos || {}).filter(s => s.entregado).length;
  const simulados = db => (db.mausoleo && db.mausoleo.sim) || [];
  const totalGrupal = db => Object.values(db.jugadores).reduce((n, j) => n + entregadosDe(j), 0) + simulados(db).reduce((n, s) => n + s.sellos, 0) + ((db.mausoleo && db.mausoleo.otros) || 0);
  const estadoMausoleo = (db, j) => {
    const total = totalGrupal(db);
    return { total, tuyos: j ? entregadosDe(j) : 0, nichos: nichos.map(n => total >= n.umbral ? { ...n, abierto: true } : { id: n.id, umbral: n.umbral, abierto: false }) };
  };
  // Marcador: solo aparecen quienes firmaron con apodo; los anónimos cuentan en el total
  const marcador = (db, j, disp) => {
    const filas = Object.entries(db.jugadores).map(([d, x]) => ({ d, apodo: x.apodo, sellos: entregadosDe(x) })).filter(f => f.sellos > 0 && f.apodo);
    simulados(db).forEach(s => filas.push({ d: null, apodo: s.apodo, sellos: s.sellos }));
    filas.sort((a, b) => b.sellos - a.sellos || a.apodo.localeCompare(b.apodo, 'es'));
    const puesto = filas.findIndex(f => f.d === disp) + 1;
    return { top: filas.slice(0, 8).map((f, i) => ({ puesto: i + 1, apodo: f.apodo, sellos: f.sellos, tu: f.d === disp })), tu: { puesto: puesto || null, sellos: entregadosDe(j), apodo: j.apodo }, firmados: filas.length };
  };
  // Ouija: el mensaje depende del nombre. Cada nombre recorre sus textos en orden; sin coincidencia, uno genérico.
  const responder = (j, nombre) => {
    const n = normalNombre(nombre), uno = n.split(' ')[0], M = (ouija && ouija.mensajes) || [];
    const k = M.findIndex(m => (m.para || []).some(p => { const q = normalNombre(p); return q === n || q === uno; }));
    const textos = k >= 0 ? M[k].textos : ((ouija && ouija.generico) || ['...']), clave = k >= 0 ? 'm' + k : 'g';
    j.ouija = j.ouija || {}; const i = j.ouija[clave] || 0; j.ouija[clave] = i + 1;
    return { texto: textos[i % textos.length], para: k >= 0 };
  };
  const handle = (method, path, body, disp) => {
    const db = leer();
    const j = db.jugadores[disp] || (db.jugadores[disp] = { apodo: null, sellos: {}, intentos: {} });
    let m;
    if (method === 'GET' && path === '/progreso') return { sellos: j.sellos, apodo: j.apodo, mausoleo: { abierto: true } };
    if (method === 'PUT' && path === '/jugador') {
      j.apodo = String(body.apodo || '').trim().slice(0, 24) || null; escribir(db); return { apodo: j.apodo };
    }
    if (method === 'POST' && path === '/intentos') {
      if (!lapidasValidas.includes(body.lapida)) throw new ErrorApi(404, { error: 'lapida_desconocida' });
      if (j.sellos[body.lapida]) throw new ErrorApi(409, { error: 'ya_sellada' });
      const token = 'int_' + rnd() + rnd(), semilla = (Math.random() * 4294967296) >>> 0;
      j.intentos[token] = { lapida: body.lapida, semilla, creado: Date.now(), respuesta: null };
      escribir(db);
      return { token, semilla, expira: new Date(Date.now() + 6e5).toISOString() };
    }
    if (method === 'POST' && (m = path.match(/^\/intentos\/([\w-]+)\/resultado$/))) {
      const it = j.intentos[m[1]];
      if (!it) throw new ErrorApi(404, { error: 'token_desconocido' });
      if (it.respuesta) return it.respuesta;                       // idempotente: el mismo token devuelve lo mismo
      let sello = null;
      if (body.gano) {
        const s = j.sellos[it.lapida] || (j.sellos[it.lapida] = { ganado: new Date().toISOString(), entregado: null });
        sello = { lapida: it.lapida, ...s };
      }
      it.respuesta = { sello }; it.ms = body.ms; escribir(db);
      return it.respuesta;
    }
    if (method === 'GET' && path === '/mausoleo') return estadoMausoleo(db, j);
    if (method === 'GET' && path === '/mausoleo/marcador') return marcador(db, j, disp);
    if (method === 'POST' && path === '/ouija') {
      if (!normalNombre(body.nombre)) throw new ErrorApi(400, { error: 'falta_nombre' });
      const r = responder(j, body.nombre); escribir(db); return r;
    }
    if (method === 'POST' && path === '/mausoleo/entregar') {
      const t = new Date().toISOString(), ids = Object.keys(j.sellos).filter(id => !j.sellos[id].entregado);
      ids.forEach(id => { j.sellos[id].entregado = t; }); escribir(db);
      return { entregados: ids, en: t, ...estadoMausoleo(db, j) };
    }
    throw new ErrorApi(404, { error: 'ruta_desconocida' });
  };
  const conJugador = (disp, fn) => { const db = leer(); const j = db.jugadores[disp] || (db.jugadores[disp] = { apodo: null, sellos: {}, intentos: {} }); fn(j, db); escribir(db); };
  return {
    handle,
    borrar(disp) { const db = leer(); delete db.jugadores[disp]; escribir(db); },
    // Pruebas del Mausoleo
    otros(n) {
      const db = leer(); db.mausoleo = db.mausoleo || {}; const sim = db.mausoleo.sim = db.mausoleo.sim || [];
      for (let k = 0; k < n; k++) {
        let s = sim.filter(x => x.sellos < 6); s = s.length && (Math.random() < 0.65 || sim.length >= SIMULADOS.length) ? s[Math.floor(Math.random() * s.length)] : null;
        if (!s) { const libre = SIMULADOS.find(a => !sim.some(x => x.apodo === a)); if (!libre) break; s = { apodo: libre, sellos: 0 }; sim.push(s); }
        s.sellos++;
      }
      escribir(db);
    },
    darSellos(disp, ids) { conJugador(disp, j => { ids.forEach(id => { if (!j.sellos[id]) j.sellos[id] = { ganado: new Date().toISOString(), entregado: null }; }); }); },
    borrarEntregas(disp) { conJugador(disp, j => { Object.values(j.sellos).forEach(s => { s.entregado = null; }); }); },
    reiniciarMausoleo() { const db = leer(); db.mausoleo = { sim: [] }; Object.values(db.jugadores).forEach(j => { j.ouija = {}; Object.values(j.sellos || {}).forEach(s => { s.entregado = null; }); }); escribir(db); },
  };
}

// cache: objeto de lab.v1 (progreso, pendientes, dispositivo, apodo). guardar: persiste la caché.
export function crearApi({ base = null, red = 'ok', cache, guardar, lapidas, nichos = [], ouija = null }) {
  const mock = base ? null : crearMock(lapidas, nichos, ouija);
  const api = { red, modo: base ? 'servidor' : 'mock' };

  async function pedir(method, path, body) {
    if (mock) {
      await espera(api.red === 'lenta' ? 2200 : 180 + Math.random() * 380);
      if (api.red === 'falla') throw new TypeError('Failed to fetch (simulado)');
      return JSON.parse(JSON.stringify(mock.handle(method, path, body, cache.dispositivo)));
    }
    const r = await fetch(base.replace(/\/$/, '') + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', 'X-Dispositivo': cache.dispositivo, 'X-Apodo': encodeURIComponent(cache.apodo || '') },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new ErrorApi(r.status, data);
    return data;
  }
  function fusionar(r) {
    if (!r || !r.sello) return;
    const { lapida, ...s } = r.sello;
    cache.progreso = cache.progreso || { sellos: {} };
    cache.progreso.sellos = cache.progreso.sellos || {};
    cache.progreso.sellos[lapida] = s; guardar();
  }
  function encolar(token, lapida, resultado) {
    cache.pendientes = cache.pendientes || [];
    if (!cache.pendientes.some(p => p.token === token)) cache.pendientes.push({ token, lapida, resultado, t: new Date().toISOString() });
    guardar();
  }

  api.progreso = async () => {
    const p = await pedir('GET', '/progreso');
    cache.progreso = { sellos: p.sellos || {}, mausoleo: p.mausoleo, en: new Date().toISOString() };
    if (!cache.apodo && p.apodo) cache.apodo = p.apodo;
    guardar(); return p;
  };
  api.iniciar = lapida => pedir('POST', '/intentos', { lapida });
  // Si falla la red y el jugador ganó, el resultado queda en cache.pendientes y se reintenta con sincronizar().
  api.resultado = async (token, lapida, resultado) => {
    try { const r = await pedir('POST', `/intentos/${token}/resultado`, resultado); fusionar(r); return r; }
    catch (e) { if (!(e instanceof ErrorApi) && resultado.gano) encolar(token, lapida, resultado); throw e; }
  };
  api.sincronizar = async () => {
    let n = 0;
    for (const p of [...(cache.pendientes || [])]) {
      try { fusionar(await pedir('POST', `/intentos/${p.token}/resultado`, p.resultado)); }
      catch (e) { if (!(e instanceof ErrorApi)) break; }       // sin red: se deja para después; error del servidor: se descarta
      cache.pendientes = cache.pendientes.filter(x => x.token !== p.token); n++; guardar();
    }
    return n;
  };
  api.setApodo = apodo => pedir('PUT', '/jugador', { apodo });
  api.mausoleo = () => pedir('GET', '/mausoleo');
  api.marcador = () => pedir('GET', '/mausoleo/marcador');
  api.ouija = nombre => pedir('POST', '/ouija', { nombre });
  // Entrega todos los sellos ganados que faltan. La caché local los marca como entregados.
  api.entregar = async () => {
    const r = await pedir('POST', '/mausoleo/entregar');
    cache.progreso = cache.progreso || { sellos: {} }; cache.progreso.sellos = cache.progreso.sellos || {};
    (r.entregados || []).forEach(id => { cache.progreso.sellos[id] = { ...(cache.progreso.sellos[id] || { ganado: null }), entregado: r.en || new Date().toISOString() }; });
    guardar(); return r;
  };
  api.dev = mock ? {
    otros: n => mock.otros(n),
    darSellos: ids => mock.darSellos(cache.dispositivo, ids),
    borrarEntregas: () => mock.borrarEntregas(cache.dispositivo),
    reiniciar: () => mock.reiniciarMausoleo(),
  } : null;
  api.borrarMock = () => { if (mock) mock.borrar(cache.dispositivo); };
  return api;
}
