// Minijuego: memorama de calaveras. Mouse, touch y teclado (flechas + Enter/Espacio).
import { registerMinigame } from './registro.js';

const OSC = '#141417', HUESO = '#ddd7ca';
const OJOS = {
  redondos:  x => `<circle cx="${x}" cy="47" r="8"/>`,
  rombo:     x => `<path d="M${x} 37l8 10-8 10-8-10z"/>`,
  cruz:      x => `<path d="M${x - 6} 41l12 12M${x + 6} 41l-12 12" stroke="${OSC}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  cerrados:  x => `<rect x="${x - 8}" y="45" width="16" height="4" rx="2"/>`,
  anillo:    x => `<circle cx="${x}" cy="47" r="8"/><circle cx="${x}" cy="47" r="3" fill="${HUESO}"/>`,
  triangulo: x => `<path d="M${x - 8} 41h16l-8 13z"/>`,
  medialuna: x => `<path d="M${x - 8} 44a8 8 0 0 0 16 0z"/>`,
  puntos:    x => `<circle cx="${x}" cy="47" r="3.5"/>`,
};
const MARCAS = {
  ninguna: () => '',
  cruz:  c => `<path d="M50 17v15M43 23.5h14" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  punto: c => `<circle cx="50" cy="26" r="4.5" fill="${c}"/>`,
  luna:  c => `<path d="M47 17a8 8 0 1 0 8 13a6.5 6.5 0 1 1-8-13z" fill="${c}"/>`,
  tres:  c => `<g fill="${c}"><circle cx="42" cy="28" r="3"/><circle cx="50" cy="23" r="3"/><circle cx="58" cy="28" r="3"/></g>`,
  raya:   c => `<path d="M40 25h20" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`,
  grieta: c => `<path d="M46 15l6 7-5 4 6 7" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  flor:  c => `<g fill="${c}"><circle cx="50" cy="19.5" r="3.4"/><circle cx="56" cy="24" r="3.4"/><circle cx="54" cy="30.5" r="3.4"/><circle cx="46" cy="30.5" r="3.4"/><circle cx="44" cy="24" r="3.4"/></g><circle cx="50" cy="25.5" r="2.6" fill="${HUESO}"/>`,
};
// La forma de los ojos y la marca distinguen cada pareja; el color solo refuerza.
const TIPOS = [
  { ojos: 'redondos',  marca: 'ninguna', c: '#a8a296', nombre: 'ojos redondos' },
  { ojos: 'rombo',     marca: 'cruz',    c: '#b8473b', nombre: 'ojos de rombo y una cruz' },
  { ojos: 'cruz',      marca: 'punto',   c: '#c9a24a', nombre: 'ojos en cruz y un punto' },
  { ojos: 'cerrados',  marca: 'luna',    c: '#8792b4', nombre: 'ojos cerrados y una luna' },
  { ojos: 'anillo',    marca: 'tres',    c: '#7a9c74', nombre: 'ojos de anillo y tres puntos' },
  { ojos: 'triangulo', marca: 'flor',    c: '#c07a45', nombre: 'ojos triangulares y una flor' },
  { ojos: 'medialuna', marca: 'raya',    c: '#b07f9e', nombre: 'ojos de media luna y una raya' },
  { ojos: 'puntos',    marca: 'grieta',  c: '#6fa3a8', nombre: 'ojos pequeños y una grieta' },
];
const calavera = t => `<svg viewBox="0 0 100 100" aria-hidden="true">
<ellipse cx="50" cy="44" rx="30" ry="28" fill="${HUESO}"/><rect x="33" y="58" width="34" height="24" rx="7" fill="${HUESO}"/>
<g fill="${OSC}">${OJOS[t.ojos](39)}${OJOS[t.ojos](61)}<path d="M50 56l-4.5 7.5h9z"/></g>
<path d="M42 70v9M50 70v9M58 70v9" stroke="${OSC}" stroke-width="2.5" stroke-linecap="round"/>${MARCAS[t.marca](t.c)}</svg>`;

const CSS = `
.mem{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;height:100%;min-height:0}
.mem-barra,.mem-vela,.mem-ayuda{width:min(560px,100%)}
.mem-barra{display:flex;justify-content:space-between;align-items:baseline;font:500 12px/1 "Oswald",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8d877b}
.mem-barra b{color:#e6e0d4;font-weight:600}
.mem-t{font:600 22px/1 "Oswald",system-ui,sans-serif;color:#e6e0d4;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.mem-vela{height:3px;background:#2c2c31;border-radius:2px;overflow:hidden}
.mem-vela i{display:block;height:100%;background:#d9a35c;transform-origin:left;transition:background .3s}
.mem-vela.baja i{background:#b8473b}
.mem-ayuda{margin:0;font:400 14px/1.45 system-ui,-apple-system,sans-serif;color:#a8a296;text-wrap:pretty}
.mem-area{flex:1;min-height:0;width:100%;display:grid;place-items:center}
.mem-grid{display:grid}
.mem-carta{position:relative;width:var(--w);aspect-ratio:3/4;padding:0;border:0;background:none;cursor:pointer;perspective:700px;border-radius:10px;-webkit-tap-highlight-color:transparent}
.mem-in{position:absolute;inset:0;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .3s cubic-bezier(.3,.7,.3,1)}
.mem-carta.vuelta .mem-in{transform:rotateY(180deg)}
.mem-dorso,.mem-cara{position:absolute;inset:0;border-radius:10px;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:grid;place-items:center;transition:visibility 0s .15s}
.mem-cara{visibility:hidden}
.mem-carta.vuelta .mem-cara{visibility:visible}
.mem-carta.vuelta .mem-dorso{visibility:hidden}
.mem.rm .mem-dorso,.mem.rm .mem-cara{transition:none}
.mem-dorso{background:#141417;border:1px solid #2c2c31;transition:border-color .15s,visibility 0s .15s}
.mem-dorso::before{content:"";width:36%;aspect-ratio:1;border-radius:50%;border:1px solid #44444a}
.mem-dorso::after{content:"";position:absolute;width:7%;aspect-ratio:1;border-radius:50%;background:#6e2c25}
.mem-cara{transform:rotateY(180deg);background:#1d1d22;border:1px solid #3a3a40;border-bottom:3px solid var(--c)}
.mem-cara svg{width:80%;height:auto}
.mem-carta.hecha .mem-cara{border-color:var(--c);box-shadow:inset 0 0 0 1px var(--c)}
.mem-carta.hecha,.mem.fin .mem-carta{cursor:default}
.mem-carta:not(.vuelta):hover .mem-dorso{border-color:#6e2c25}
.mem-carta:focus-visible{outline:2px solid #c9c3b6;outline-offset:3px}
.mem.rm .mem-in{transition:none}
@media (prefers-reduced-motion:reduce){.mem-in{transition:none}}
`;
function estilo() {
  if (document.getElementById('mem-css')) return;
  const s = document.createElement('style'); s.id = 'mem-css'; s.textContent = CSS; document.head.appendChild(s);
}
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

registerMinigame({
  id: 'memorama',
  title: 'Memorama de calaveras',
  seconds: 50,
  create(root, { params = {}, seed = 1, sfx = () => {}, reducedMotion = false } = {}) {
    estilo();
    const pares = Math.min(TIPOS.length, Math.max(2, params.pares || 8)), total = params.segundos || 50;
    const R = rng(seed), mazo = [];
    for (let i = 0; i < pares; i++) mazo.push(i, i);
    for (let i = mazo.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [mazo[i], mazo[j]] = [mazo[j], mazo[i]]; }

    root.innerHTML = `<div class="mem${reducedMotion ? ' rm' : ''}">
      <div class="mem-barra"><span>Parejas <b class="mem-n">0</b> / ${pares}</span><span class="mem-t" aria-hidden="true">${total}</span></div>
      <div class="mem-vela" aria-hidden="true"><i></i></div>
      <p class="mem-ayuda">Encuentra las ${pares} parejas antes de que se apague la vela. El tiempo empieza con la primera carta.</p>
      <div class="mem-area"><div class="mem-grid" role="group" aria-label="Cartas"></div></div>
      <p class="sr" aria-live="polite"></p></div>`;
    const el = root.firstElementChild, grid = el.querySelector('.mem-grid'), area = el.querySelector('.mem-area');
    const nEl = el.querySelector('.mem-n'), tEl = el.querySelector('.mem-t'), vela = el.querySelector('.mem-vela'), barra = vela.firstElementChild, live = el.querySelector('[aria-live]');

    const cartas = mazo.map((tipo, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mem-carta'; b.tabIndex = i === 0 ? 0 : -1; b.style.setProperty('--c', TIPOS[tipo].c);
      b.innerHTML = `<span class="mem-in"><span class="mem-dorso"></span><span class="mem-cara">${calavera(TIPOS[tipo])}</span></span>`;
      grid.appendChild(b);
      return { el: b, tipo, abierta: false, hecha: false };
    });
    const etiqueta = i => {
      const c = cartas[i], t = TIPOS[c.tipo];
      c.el.setAttribute('aria-label', `Carta ${i + 1}: ` + (c.hecha ? `calavera de ${t.nombre}, pareja encontrada` : c.abierta ? `calavera de ${t.nombre}` : 'boca abajo'));
    };
    cartas.forEach((_, i) => etiqueta(i));

    let cols = 4, abiertas = [], hechas = 0, movs = 0, restante = total, corriendo = false, fin = false, bloqueo = false, destruido = false;
    let raf = 0, last = 0, avisos = new Set();
    const timers = new Set(), despues = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destruido) fn(); }, ms); timers.add(id); };
    const anunciar = t => { live.textContent = ''; despues(() => { live.textContent = t; }, 30); };

    function medir() {
      const W = area.clientWidth, H = area.clientHeight, n = cartas.length; if (!W || !H) return;
      cols = n === 12 && W / H < 0.9 ? 3 : 4;
      const rows = Math.ceil(n / cols), g = W < 420 ? 8 : 12;
      const w = Math.floor(Math.max(40, Math.min((W - (cols - 1) * g) / cols, ((H - (rows - 1) * g) / rows) * 0.75, 132)));
      grid.style.gridTemplateColumns = `repeat(${cols}, ${w}px)`; grid.style.gap = g + 'px'; grid.style.setProperty('--w', w + 'px');
    }
    const ro = new ResizeObserver(medir); ro.observe(area);

    function pintarTiempo() {
      tEl.textContent = Math.ceil(restante);
      barra.style.transform = `scaleX(${Math.max(0, restante / total)})`;
      vela.classList.toggle('baja', restante <= 10);
      for (const s of [30, 10]) if (restante <= s && total > s && !avisos.has(s)) { avisos.add(s); anunciar(`Quedan ${s} segundos.`); }
    }
    function tick(t) {
      if (!corriendo || destruido) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      restante -= dt;
      if (restante <= 0) {
        restante = 0; corriendo = false; fin = true; el.classList.add('fin');
        anunciar('Se apagó la vela.');
        despues(() => game.onLose && game.onLose({ razon: 'tiempo', parejas: hechas }), 600);
      }
      pintarTiempo();
    }
    function voltear(i) {
      const c = cartas[i];
      if (fin || bloqueo || c.hecha || c.abierta) return;
      if (!corriendo) { corriendo = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      c.abierta = true; c.el.classList.add('vuelta'); etiqueta(i); sfx('flip', 0.7);
      abiertas.push(i);
      if (abiertas.length < 2) return;
      movs++;
      const [a, b] = abiertas; abiertas = [];
      if (cartas[a].tipo === cartas[b].tipo) {
        [a, b].forEach(k => { cartas[k].hecha = true; cartas[k].el.classList.add('hecha'); cartas[k].el.setAttribute('aria-disabled', 'true'); etiqueta(k); });
        hechas++; nEl.textContent = hechas; sfx('tink');
        anunciar(`Pareja encontrada. ${hechas} de ${pares}.`);
        if (hechas === pares) {
          fin = true; corriendo = false; el.classList.add('fin');
          const ms = Math.round((total - restante) * 1000);
          despues(() => game.onWin && game.onWin({ ms, movimientos: movs }), 500);
        }
      } else {
        bloqueo = true; anunciar('No coinciden.');
        despues(() => {
          [a, b].forEach(k => { cartas[k].abierta = false; cartas[k].el.classList.remove('vuelta'); etiqueta(k); });
          bloqueo = false; sfx('flip', 0.35);
        }, reducedMotion ? 850 : 620);
      }
    }
    grid.addEventListener('click', e => { const b = e.target.closest('.mem-carta'); if (b) voltear(cartas.findIndex(c => c.el === b)); });
    grid.addEventListener('keydown', e => {
      const i = cartas.findIndex(c => c.el === document.activeElement); if (i < 0) return;
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key]; if (d === undefined) return;
      e.preventDefault();
      const j = Math.min(cartas.length - 1, Math.max(0, i + d));
      cartas[i].el.tabIndex = -1; cartas[j].el.tabIndex = 0; cartas[j].el.focus();
    });

    const game = {
      onWin: null, onLose: null, token: null,
      start(token) { game.token = token; medir(); pintarTiempo(); cartas[0].el.focus({ preventScroll: true }); },
      destroy() { destruido = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); ro.disconnect(); root.innerHTML = ''; },
    };
    return game;
  },
});
