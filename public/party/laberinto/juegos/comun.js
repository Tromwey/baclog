// Piezas compartidas por los minijuegos: estilos de la barra, RNG con semilla, reloj tipo vela y anuncios.
export function estilo(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s);
}
export function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

estilo('mg-css', `
.mg{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;height:100%;min-height:0}
.mg-barra,.mg-vela,.mg-ayuda{width:min(560px,100%)}
.mg-barra{display:flex;justify-content:space-between;align-items:baseline;font:500 12px/1 "Oswald",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8d877b}
.mg-barra b{color:#e6e0d4;font-weight:600}
.mg-t{font:600 22px/1 "Oswald",system-ui,sans-serif;color:#e6e0d4;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.mg-vela{height:3px;background:#2c2c31;border-radius:2px;overflow:hidden}
.mg-vela i{display:block;height:100%;background:#d9a35c;transform-origin:left;transition:background .3s}
.mg-vela.baja i{background:#b8473b}
.mg-ayuda{margin:0;font:400 14px/1.45 system-ui,-apple-system,sans-serif;color:#a8a296;text-wrap:pretty}
.mg-area{flex:1;min-height:0;width:100%;display:grid;place-items:center}
.mg-btn{min-height:44px;padding:0 18px;border-radius:999px;background:rgba(10,10,12,.6);border:1px solid #6e2c25;color:#c9c3b6;font:500 12px/1 "Oswald",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.14em;cursor:pointer}
.mg-btn:hover{background:#6e2c25;color:#e6e0d4}
.mg-btn:disabled{opacity:.4;cursor:default;background:rgba(10,10,12,.6)}
.mg :focus-visible{outline:2px solid #c9c3b6;outline-offset:3px}
.mg:focus,.mg:focus-visible{outline:none}
`);

// Marco común: barra (etiqueta + tiempo), vela de tiempo, ayuda, área de juego y región aria-live.
export function marco(root, { etiqueta = '', total, ayuda = '' }) {
  root.innerHTML = `<div class="mg">
    <div class="mg-barra"><span class="mg-l">${etiqueta}</span><span class="mg-t" aria-hidden="true">${total}</span></div>
    <div class="mg-vela" aria-hidden="true"><i></i></div>
    <p class="mg-ayuda">${ayuda}</p>
    <div class="mg-area"></div>
    <p class="sr" aria-live="polite"></p></div>`;
  const el = root.firstElementChild;
  return { el, area: el.querySelector('.mg-area'), label: el.querySelector('.mg-l'), ayuda: el.querySelector('.mg-ayuda'),
    tEl: el.querySelector('.mg-t'), vela: el.querySelector('.mg-vela'), live: el.querySelector('[aria-live]') };
}

// Reloj: corre solo cuando `correr()`; avisa a los 30 y 10 s; llama onFin al llegar a 0.
export function reloj(m, total, onFin) {
  const libre = !total;
  let restante = total || 0, usado = 0, corriendo = false, raf = 0, last = 0, muerto = false;
  const avisos = new Set();
  if (libre) m.vela.hidden = true;
  const fmt = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const pintar = () => {
    if (libre) { m.tEl.textContent = fmt(usado); return; }
    m.tEl.textContent = Math.ceil(restante);
    m.vela.firstElementChild.style.transform = `scaleX(${Math.max(0, restante / total)})`;
    m.vela.classList.toggle('baja', restante <= 10);
    for (const s of [30, 10]) if (restante <= s && total > s && !avisos.has(s)) { avisos.add(s); anunciar(m, `Quedan ${s} segundos.`); }
  };
  const tick = t => {
    if (!corriendo || muerto) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (t - last) / 1000); last = t; usado += dt;
    if (libre) { pintar(); return; }
    restante -= dt;
    if (restante <= 0) { restante = 0; corriendo = false; pintar(); onFin(); return; }
    pintar();
  };
  pintar();
  return {
    correr() { if (corriendo || muerto || (!libre && restante <= 0)) return; corriendo = true; last = performance.now(); raf = requestAnimationFrame(tick); },
    parar() { corriendo = false; cancelAnimationFrame(raf); },
    restar(s) { if (libre) return; restante = Math.max(0.01, restante - s); pintar(); },
    get usado() { return libre ? usado : total - restante; },
    get restante() { return restante; },
    get corriendo() { return corriendo; },
    destroy() { muerto = true; corriendo = false; cancelAnimationFrame(raf); },
  };
}

export function anunciar(m, t) { m.live.textContent = ''; setTimeout(() => { m.live.textContent = t; }, 30); }

// Temporizadores que se cancelan solos al destruir el juego.
export function temporizadores() {
  const ids = new Set(); let muerto = false;
  return {
    despues(fn, ms) { const id = setTimeout(() => { ids.delete(id); if (!muerto) fn(); }, ms); ids.add(id); return id; },
    destroy() { muerto = true; ids.forEach(clearTimeout); },
  };
}
