// Logros compartidos entre el laberinto y el Mausoleo: reglas sobre la caché lab.v1 (mausoleo/logros.json)
// y un aviso en pantalla la primera vez que se consigue cada uno. cache.logrosVistos = { id: true } evita repetirlo.
export async function cargarLogros(url) {
  try { const j = await fetch(url, { cache: 'no-cache' }).then(r => r.json()); return (j.logros || []).slice(0, 6); } catch (_) { return []; }
}

export function crearLogros({ logros = [], mapa, cache, guardar }) {
  const lapidas = Object.values(mapa.lapidas || {}).filter(l => l.juego).map(l => l.id);
  const encargos = (mapa.encargos || []).map(e => e.id), cartas = mapa.cartas || [];
  const sellos = () => {   // los del servidor más los ganados que esperan sincronizar
    const s = { ...((cache.progreso && cache.progreso.sellos) || {}) };
    (cache.pendientes || []).forEach(p => { if (p.resultado && p.resultado.gano && !s[p.lapida]) s[p.lapida] = { pendiente: true }; });
    return s;
  };
  const tarot = () => { const m = cache.mau && cache.mau.mesa; return Array.isArray(m) && cartas.length > 0 && cartas.every((c, k) => m[k] && m[k].id === c.id && m[k].inv === !!c.invertida); };
  const COLECCION = {
    cartas: () => cartas.length > 0 && cartas.every(c => (cache.cartas || {})[c.id]),
    foto: () => [1, 2, 3, 4].every(i => (cache.pistas || {})['foto' + i]),
    caja: () => !!(cache.pistas || {}).caja,
    encargos: () => encargos.length > 0 && encargos.every(id => (cache.encargos || {})[id]),
    selloMesa: () => !!(cache.mau && cache.mau.selloMesa),
    calabaza: () => !!cache.calabaza,
  };
  const REGLAS = {
    tarot,
    gatos: () => encargos.length > 0 && encargos.every(id => (cache.encargos || {})[id] === 'entregado') && !!cache.gatosTumba,   // [Kura] y el rayo en la tumba
    lapidas: () => lapidas.length > 0 && lapidas.every(id => sellos()[id]),
    cuervos: l => Object.keys(cache.cuervos || {}).length >= (l.cuantos || 4),
    calabaza: () => !!cache.calabaza,
    foto: () => COLECCION.foto(),
    coleccionables: l => (l.coleccionables || []).length > 0 && l.coleccionables.every(k => !!(COLECCION[k] && COLECCION[k]())),
  };
  const obtenido = l => !!(cache.mau && cache.mau.devLogros) || !!(REGLAS[l.regla] && REGLAS[l.regla](l));
  // Logros recién conseguidos (y los marca como avisados). La primera vez solo registra lo que ya había, sin avisar.
  function nuevos() {
    if (!cache.logrosVistos) { cache.logrosVistos = {}; logros.forEach(l => { if (obtenido(l)) cache.logrosVistos[l.id] = true; }); guardar(); return []; }
    const v = cache.logrosVistos, n = logros.filter(l => obtenido(l) && !v[l.id]);
    n.forEach(l => { v[l.id] = true; }); if (n.length) guardar();
    return n;
  }
  return { logros, obtenido, nuevos, tarot };
}

// Tarjeta "Logro conseguido": baja, se queda unos segundos y se va; si llegan varios, uno tras otro.
// La primera vez agrega una línea que explica dónde se ven los logros.
export function crearAvisoLogros(host, { cache, guardar, sfx = null, ayuda = 'Los logros están en la capilla Marcador y logros del Mausoleo.' }) {
  const el = document.createElement('div'); el.className = 'lab-logro'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="lab-logro-k">\u2605 Logro conseguido</span><b></b><span class="lab-logro-c"></span><span class="lab-logro-a"></span>';
  host.appendChild(el);
  const cola = []; let activo = false;
  function siguiente() {
    const l = cola.shift(); if (!l) { activo = false; return; } activo = true;
    const conAyuda = !cache.logrosAyuda;
    el.querySelector('b').textContent = l.titulo; el.querySelector('.lab-logro-c').textContent = l.como;
    el.querySelector('.lab-logro-a').textContent = conAyuda ? ayuda : '';
    if (conAyuda) { cache.logrosAyuda = true; guardar(); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (sfx) sfx('bell', 0.5);
    setTimeout(() => { el.classList.remove('on'); setTimeout(siguiente, 450); }, conAyuda ? 6500 : 4800);
  }
  return { el, avisar(ls = []) { ls.forEach(l => cola.push(l)); if (!activo && cola.length) siguiente(); } };
}
