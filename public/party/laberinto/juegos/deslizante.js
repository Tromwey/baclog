// Minijuego: rompecabezas deslizante del epitafio. Mouse/touch (tocar una pieza de la fila o columna del hueco)
// y teclado (las flechas mueven la pieza vecina hacia el hueco).
import { registerMinigame } from './registro.js';
import { estilo, rng, marco, reloj, anunciar, temporizadores } from './comun.js';

estilo('desl-css', `
.desl-wrap{display:flex;flex-direction:column;align-items:center;gap:12px}
.desl{position:relative;width:var(--s);height:var(--s);border-radius:10px;background:#0c0c0e;border:1px solid #2c2c31;outline:none}
.desl-p{position:absolute;left:0;top:0;width:var(--t);height:var(--t);padding:0;border:0;border-radius:6px;cursor:pointer;background-size:var(--s) var(--s);box-shadow:inset 0 0 0 1px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .14s ease-out}
.desl-p span{position:absolute;right:5px;bottom:4px;font:600 11px/1 "Oswald",system-ui,sans-serif;color:rgba(230,224,212,.55);letter-spacing:.04em}
.desl-p:not(.mov){cursor:default}
.desl-p.mov:hover{filter:brightness(1.15)}
.desl-hueco{position:absolute;left:0;top:0;width:var(--t);height:var(--t);border-radius:6px;background:#050506;border:1px dashed rgba(201,195,182,.35);box-shadow:inset 0 4px 14px rgba(0,0,0,.95);pointer-events:none;transition:transform .14s ease-out}
.desl.listo .desl-hueco,.desl.ver .desl-hueco{opacity:0}
.desl.listo .desl-p{cursor:default;filter:none}
.desl.listo .desl-p span{opacity:0}
.desl:focus-visible{outline:2px solid #c9c3b6;outline-offset:3px}
.desl-ver{font:500 12px/1 "Oswald",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8d877b;background:none;border:0;cursor:pointer;min-height:44px;padding:0 10px}
.desl-ver[aria-pressed="true"]{color:#e6e0d4}
.desl.ver .desl-p{opacity:0}
.desl.ver{background:var(--img) 0 0/100% 100%}
.mg.rm .desl-p,.mg.rm .desl-hueco{transition:none}
`);

function losa(texto, S) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const R = rng(7); g.fillStyle = '#5f5d5a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) { const v = 70 + R() * 40 | 0; g.fillStyle = `rgba(${v},${v - 2},${v - 6},.35)`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  g.strokeStyle = 'rgba(30,30,32,.5)'; g.lineWidth = S * 0.012; g.strokeRect(S * 0.05, S * 0.05, S * 0.9, S * 0.9);
  g.fillStyle = '#28272a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const palabras = texto.split(/\s+/), lineas = [], fs = S * 0.085, max = S * 0.74;
  g.font = `400 ${fs}px Cinzel, Georgia, serif`;
  let l = '';
  for (const w of palabras) { const t = l ? l + ' ' + w : w; if (g.measureText(t).width > max && l) { lineas.push(l); l = w; } else l = t; }
  if (l) lineas.push(l);
  const lh = fs * 1.45, y0 = S / 2 - (lineas.length - 1) * lh / 2;
  lineas.forEach((t, i) => { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillText(t, S / 2, y0 + i * lh + 1.5); g.fillStyle = '#29282b'; g.fillText(t, S / 2, y0 + i * lh); });
  g.font = `700 ${S * 0.06}px Cinzel, Georgia, serif`; g.fillStyle = '#3a393c'; /* [Kura] sin cruz: en iOS sale como emoji */
  return c.toDataURL('image/jpeg', 0.86);
}

registerMinigame({
  id: 'deslizante',
  title: 'Epitafio roto',
  seconds: 0,                       // sin límite de tiempo
  create(root, { params = {}, seed = 1, sfx = () => {}, reducedMotion = false, epitafio = '' } = {}) {
    const L = Math.min(4, Math.max(3, params.lado || 3)), total = params.segundos || 0, texto = params.texto || epitafio || 'Descanse en paz';
    const m = marco(root, { total, etiqueta: 'Movimientos <b class="desl-m">0</b>',
      ayuda: (total ? '' : 'Sin límite de tiempo. ') + 'Ordena las piezas para leer el epitafio. El hueco es el cuadro vacío: toca una pieza de su fila o columna para deslizarla, o usa las flechas.' });
    if (reducedMotion) m.el.classList.add('rm');
    m.area.innerHTML = `<div class="desl-wrap"><div class="desl" tabindex="0" role="application" aria-label="Rompecabezas de ${L} por ${L}. Usa las flechas para mover piezas hacia el hueco."></div><button type="button" class="desl-ver" aria-pressed="false">Ver la lápida entera</button></div>`;
    const tab = m.area.querySelector('.desl'), ver = m.area.querySelector('.desl-ver'), movEl = m.el.querySelector('.desl-m');
    const T = temporizadores();
    // estado: pos[k] = índice de celda de la pieza k (k = 0..L*L-2); hueco = celda vacía
    const N = L * L, pos = Array.from({ length: N - 1 }, (_, k) => k); let hueco = N - 1;
    const R = rng(seed), vec = c => [c - L, c + L, c % L ? c - 1 : -1, (c + 1) % L ? c + 1 : -1].filter(x => x >= 0 && x < N);
    let prev = -1;
    for (let i = 0; i < 60 || resuelto(); i++) {
      const op = vec(hueco).filter(x => x !== prev), c = op[Math.floor(R() * op.length)];
      const k = pos.indexOf(c); pos[k] = hueco; prev = hueco; hueco = c;
      if (i > 400) break;
    }
    function resuelto() { return pos.every((c, k) => c === k); }
    let piezas = [], img = '', S = 0, movs = 0, fin = false;
    function medir() {
      const W = m.area.clientWidth, H = m.area.clientHeight - 56; if (!W || H <= 0) return;
      S = Math.floor(Math.max(180, Math.min(W, H, 420)));
      tab.style.setProperty('--s', S + 'px'); tab.style.setProperty('--t', (S / L) + 'px');
      tab.style.setProperty('--img', `url(${img})`);
      piezas.forEach(p => { p.style.backgroundPosition = `-${(p._k % L) * S / L}px -${Math.floor(p._k / L) * S / L}px`; });
      pintar();
    }
    let huecoEl = null;
    function pintar() {
      const t = S / L, hf = Math.floor(hueco / L), hc = hueco % L;
      piezas.forEach(p => {
        const c = pos[p._k], movible = !fin && (Math.floor(c / L) === hf || c % L === hc);
        p.style.transform = `translate(${(c % L) * t}px,${Math.floor(c / L) * t}px)`;
        p.classList.toggle('mov', movible); p.setAttribute('aria-label', `Pieza ${p._k + 1}${movible ? ', se puede mover' : ''}`);
      });
      if (huecoEl) huecoEl.style.transform = `translate(${hc * t}px,${hf * t}px)`;
    }
    function mover(c) {
      if (fin) return false;
      const k = pos.indexOf(c); if (k < 0) return false;
      const fila = Math.floor(c / L) === Math.floor(hueco / L), col = c % L === hueco % L;
      if (!fila && !col) return false;
      clk.correr();
      const paso = fila ? (c < hueco ? -1 : 1) : (c < hueco ? -L : L);
      while (hueco !== c) { const sig = hueco + paso, kk = pos.indexOf(sig); pos[kk] = hueco; hueco = sig; movs++; }
      movEl.textContent = movs; pintar(); sfx('click', 0.8);
      if (resuelto()) {
        fin = true; clk.parar(); tab.classList.add('listo'); anunciar(m, 'Epitafio completo.');
        sfx('tink'); T.despues(() => game.onWin && game.onWin({ ms: Math.round(clk.usado * 1000), movimientos: movs }), 900);
      }
      return true;
    }
    const clk = reloj(m, total, () => { if (fin) return; fin = true; anunciar(m, 'Se acabó el tiempo.'); T.despues(() => game.onLose && game.onLose({ razon: 'tiempo' }), 500); });
    tab.addEventListener('click', e => { const p = e.target.closest('.desl-p'); if (p) mover(pos[p._k]); });
    tab.addEventListener('keydown', e => {
      const r = Math.floor(hueco / L), c = hueco % L;
      const objetivo = { ArrowUp: r < L - 1 ? hueco + L : -1, ArrowDown: r > 0 ? hueco - L : -1, ArrowLeft: c < L - 1 ? hueco + 1 : -1, ArrowRight: c > 0 ? hueco - 1 : -1 }[e.key];
      if (objetivo === undefined) return;
      e.preventDefault(); if (objetivo >= 0) mover(objetivo);
    });
    ver.addEventListener('click', () => { const on = !tab.classList.contains('ver'); tab.classList.toggle('ver', on); ver.setAttribute('aria-pressed', on); ver.textContent = on ? 'Volver a las piezas' : 'Ver la lápida entera'; });
    const ro = new ResizeObserver(medir);
    const game = {
      onWin: null, onLose: null,
      async start() {
        try { await document.fonts.load('400 30px Cinzel'); } catch (_) {}
        img = losa(texto, 840);
        huecoEl = document.createElement('div'); huecoEl.className = 'desl-hueco'; huecoEl.setAttribute('aria-hidden', 'true'); tab.appendChild(huecoEl);
        piezas = pos.map((_, k) => { const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.className = 'desl-p'; b._k = k; b.style.backgroundImage = `url(${img})`; b.innerHTML = `<span>${k + 1}</span>`; tab.appendChild(b); return b; });
        ro.observe(m.area); medir(); tab.focus({ preventScroll: true });
      },
      destroy() { fin = true; T.destroy(); clk.destroy(); ro.disconnect(); root.innerHTML = ''; },
    };
    return game;
  },
});
