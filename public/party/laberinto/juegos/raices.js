// Minijuego: raíces. Gira las piezas para llevar la luz de la vela hasta la lápida.
// Mouse/touch: tocar gira 90°. Teclado: flechas mueven el foco, Enter/Espacio gira.
import { registerMinigame } from './registro.js';
import { estilo, rng, marco, reloj, anunciar, temporizadores } from './comun.js';

estilo('rai-css', `
.rai{display:grid;grid-template-columns:var(--b) repeat(var(--l),var(--t)) var(--b);gap:4px;align-items:center}
.rai-c{width:var(--t);height:var(--t);padding:0;border:0;border-radius:8px;background:#141417;cursor:pointer;display:grid;place-items:center}
.rai-c:hover{background:#1c1c20}
.rai-c svg{width:100%;height:100%;transition:transform .16s ease-out}
.rai-c path{stroke:#4a3c30;transition:stroke .2s}
.rai-c circle{fill:#4a3c30;transition:fill .2s}
.rai-c.luz path{stroke:#e8a04a}
.rai-c.luz circle{fill:#e8a04a}
.rai.listo .rai-c{cursor:default}
.rai-borde{width:var(--b);height:var(--t);display:grid;place-items:center}
.rai-borde svg{width:100%;height:auto}
.mg.rm .rai-c svg{transition:none}
`);
const N = 1, E = 2, S = 4, W = 8, DIRS = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
const rot = (mk, k) => { let v = mk; for (let i = 0; i < k; i++) v = ((v << 1) | (v >> 3)) & 15; return v; };
const LADO = { [N]: 'M50 50V-2', [E]: 'M50 50H102', [S]: 'M50 50V102', [W]: 'M50 50H-2' };
const svgPieza = mk => `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke-width="15" stroke-linecap="round">${[N, E, S, W].filter(b => mk & b).map(b => `<path d="${LADO[b]}"/>`).join('')}</g><circle cx="50" cy="50" r="10"/></svg>`;
const NOMBRE = mk => ({ 5: 'recta vertical', 10: 'recta horizontal', 3: 'codo norte-este', 6: 'codo este-sur', 12: 'codo sur-oeste', 9: 'codo oeste-norte', 7: 'te sin oeste', 14: 'te sin norte', 13: 'te sin este', 11: 'te sin sur' }[mk] || 'pieza');

registerMinigame({
  id: 'raices',
  title: 'Raíces',
  seconds: 60,
  create(root, { params = {}, seed = 1, sfx = () => {}, reducedMotion = false } = {}) {
    const L = Math.min(5, Math.max(3, params.lado || 4)), total = params.segundos || 60, R = rng(seed);
    const m = marco(root, { total, etiqueta: 'Giros <b class="rai-g">0</b>',
      ayuda: 'Gira las raíces para que la luz de la vela llegue a la lápida. Toca una pieza para girarla.' });
    if (reducedMotion) m.el.classList.add('rm');
    // Camino con semilla de la columna 0 (fila r0) a la columna L-1 (fila r1)
    const r0 = Math.floor(R() * L), r1 = Math.floor(R() * L);
    let camino = null;
    function dfs(x, y, vis, ruta) {
      if (x === L - 1 && y === r1 && ruta.length >= L + 2) { camino = ruta.slice(); return true; }
      const ops = DIRS.map(d => [x + d[1], y + d[2]]).filter(([a, b]) => a >= 0 && b >= 0 && a < L && b < L && !vis.has(a + ',' + b));
      for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
      for (const [a, b] of ops) { vis.add(a + ',' + b); ruta.push([a, b]); if (dfs(a, b, vis, ruta)) return true; ruta.pop(); vis.delete(a + ',' + b); }
      return false;
    }
    dfs(0, r0, new Set(['0,' + r0]), [[0, r0]]);
    if (!camino) camino = Array.from({ length: L }, (_, i) => [i, r0]);
    const sol = Array(L * L).fill(0), enCamino = new Set();
    const dirA = (a, b) => DIRS.find(d => a[0] + d[1] === b[0] && a[1] + d[2] === b[1])[0];
    camino.forEach((c, i) => {
      const prev = i === 0 ? W : dirA(c, camino[i - 1]), next = i === camino.length - 1 ? E : dirA(c, camino[i + 1]);
      sol[c[1] * L + c[0]] = prev | next; enCamino.add(c[1] * L + c[0]);
    });
    const RELLENO = [5, 3, 7, 3, 5];
    for (let i = 0; i < L * L; i++) if (!enCamino.has(i)) sol[i] = rot(RELLENO[Math.floor(R() * RELLENO.length)], Math.floor(R() * 4));
    const giro = sol.map(() => Math.floor(R() * 4));
    const mask = i => rot(sol[i], giro[i]);

    m.area.innerHTML = `<div class="rai" role="grid" aria-label="Raíces de ${L} por ${L}"></div>`;
    const grid = m.area.firstElementChild, gEl = m.el.querySelector('.rai-g');
    const vela = '<svg viewBox="0 0 40 60" aria-hidden="true"><path d="M20 6c5 7 6 11 0 17c-6-6-5-10 0-17z" fill="#ffc27a"/><rect x="13" y="24" width="14" height="30" rx="3" fill="#d9d2c0"/></svg>';
    const lapida = '<svg viewBox="0 0 40 60" aria-hidden="true"><path d="M6 56V22a14 14 0 0 1 28 0v34z" fill="#8d8b88"/><path d="M20 26v14M14 31h12" stroke="#55565c" stroke-width="3"/></svg>';
    const celdas = [];
    let ang = giro.map(g => g * 90);
    for (let y = 0; y < L; y++) {
      const izq = document.createElement('div'); izq.className = 'rai-borde'; if (y === r0) izq.innerHTML = vela; grid.appendChild(izq);
      for (let x = 0; x < L; x++) {
        const i = y * L + x, b = document.createElement('button');
        b.type = 'button'; b.className = 'rai-c'; b.tabIndex = i === 0 ? 0 : -1; b.setAttribute('role', 'gridcell');
        b.innerHTML = svgPieza(sol[i]); b.firstElementChild.style.transform = `rotate(${ang[i]}deg)`;
        grid.appendChild(b); celdas.push(b);
      }
      const der = document.createElement('div'); der.className = 'rai-borde'; if (y === r1) der.innerHTML = lapida; grid.appendChild(der);
    }
    const T = temporizadores();
    let giros = 0, fin = false;
    function luz() {
      const on = new Set(), q = [];
      const i0 = r0 * L; if (mask(i0) & W) { on.add(i0); q.push(i0); }
      while (q.length) {
        const i = q.shift(), x = i % L, y = (i / L) | 0, mk = mask(i);
        for (const [b, dx, dy, opu] of DIRS) {
          if (!(mk & b)) continue; const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= L || ny >= L) continue;
          const j = ny * L + nx; if (!on.has(j) && (mask(j) & opu)) { on.add(j); q.push(j); }
        }
      }
      celdas.forEach((c, i) => {
        c.classList.toggle('luz', on.has(i));
        c.setAttribute('aria-label', `Fila ${((i / L) | 0) + 1}, columna ${(i % L) + 1}: ${NOMBRE(mask(i))}${on.has(i) ? ', con luz' : ''}`);
      });
      const fin1 = r1 * L + L - 1;
      return on.has(fin1) && (mask(fin1) & E);
    }
    if (luz()) { giro[camino[0][1] * L + camino[0][0]] = (giro[camino[0][1] * L + camino[0][0]] + 1) % 4; ang[camino[0][1] * L] += 90; celdas[camino[0][1] * L].firstElementChild.style.transform = `rotate(${ang[camino[0][1] * L]}deg)`; luz(); }
    function girar(i) {
      if (fin) return; clk.correr();
      giro[i] = (giro[i] + 1) % 4; ang[i] += 90; giros++; gEl.textContent = giros;
      celdas[i].firstElementChild.style.transform = `rotate(${ang[i]}deg)`; sfx('click', 0.7);
      if (luz()) {
        fin = true; clk.parar(); grid.classList.add('listo'); sfx('tink'); anunciar(m, 'La luz llegó a la lápida.');
        T.despues(() => game.onWin && game.onWin({ ms: Math.round(clk.usado * 1000), giros }), 900);
      }
    }
    grid.addEventListener('click', e => { const b = e.target.closest('.rai-c'); if (b) girar(celdas.indexOf(b)); });
    grid.addEventListener('keydown', e => {
      const i = celdas.indexOf(document.activeElement); if (i < 0) return;
      const x = i % L, y = (i / L) | 0;
      const j = { ArrowLeft: x > 0 ? i - 1 : i, ArrowRight: x < L - 1 ? i + 1 : i, ArrowUp: y > 0 ? i - L : i, ArrowDown: y < L - 1 ? i + L : i }[e.key];
      if (j === undefined) return;
      e.preventDefault(); celdas[i].tabIndex = -1; celdas[j].tabIndex = 0; celdas[j].focus();
    });
    function medir() {
      const W0 = m.area.clientWidth, H0 = m.area.clientHeight; if (!W0 || !H0) return;
      const t = Math.floor(Math.max(44, Math.min((W0 - 8 * (L + 1)) / (L + 1.2), (H0 - 4 * L) / L, 96)));
      grid.style.setProperty('--t', t + 'px'); grid.style.setProperty('--b', Math.round(t * 0.6) + 'px'); grid.style.setProperty('--l', L);
    }
    const ro = new ResizeObserver(medir);
    const clk = reloj(m, total, () => { if (fin) return; fin = true; anunciar(m, 'Se acabó el tiempo.'); T.despues(() => game.onLose && game.onLose({ razon: 'tiempo', giros }), 500); });
    const game = {
      onWin: null, onLose: null,
      start() { ro.observe(m.area); medir(); celdas[0].focus({ preventScroll: true }); },
      destroy() { fin = true; T.destroy(); clk.destroy(); ro.disconnect(); root.innerHTML = ''; },
    };
    return game;
  },
});
