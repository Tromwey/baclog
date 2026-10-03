// Minijuego: atrapa almas. Mueve el farol con mouse, dedo o ← → (también A/D).
import { registerMinigame } from './registro.js';
import { estilo, rng, marco, reloj, anunciar, temporizadores } from './comun.js';

estilo('almas-css', `
.almas{position:relative;width:min(560px,100%);height:100%;max-height:640px;border-radius:12px;overflow:hidden;border:1px solid #2c2c31;background:#0b0c10;touch-action:none;cursor:none;outline:none}
.almas canvas{display:block;width:100%;height:100%}
.almas:focus-visible{outline:2px solid #c9c3b6;outline-offset:3px}
`);

registerMinigame({
  id: 'almas',
  title: 'Atrapa almas',
  seconds: 40,
  create(root, { params = {}, seed = 1, sfx = () => {}, reducedMotion = false } = {}) {
    const meta = params.meta || 22, total = params.segundos || 40, conCeniza = params.cenizas !== false, castigo = params.castigo || 2;
    const m = marco(root, { total, etiqueta: `Almas <b class="al-n">0</b> / ${meta}`,
      ayuda: `Recoge ${meta} almas con el farol antes de que se apague la vela.${conCeniza ? ` Esquiva las cenizas rojas: cada una te quita ${castigo}.` : ''} Mueve el farol con el dedo, el mouse o las flechas.` });
    m.area.innerHTML = '<div class="almas" tabindex="0" role="application" aria-label="Atrapa almas. Flechas izquierda y derecha mueven el farol."><canvas></canvas></div>';
    const caja = m.area.querySelector('.almas'), cv = caja.querySelector('canvas'), g = cv.getContext('2d'), nEl = m.el.querySelector('.al-n');
    const T = temporizadores(), R = rng(seed), lento = reducedMotion ? 0.6 : 1;
    let W = 0, H = 0, dpr = 1, x = 0.5, xT = 0.5, raf = 0, last = 0, fin = false, empezado = false, n = 0, spawn = 0.4, t = 0;
    const almas = [], chispas = [], teclas = new Set();
    const FW = params.farol || 0.15;           // ancho del farol (fracción)
    let rojo = 0;
    function medir() {
      const r = caja.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ro = new ResizeObserver(medir);
    const clk = reloj(m, total, () => { if (fin) return; fin = true; anunciar(m, `Se acabó el tiempo. ${n} de ${meta}.`); T.despues(() => game.onLose && game.onLose({ razon: 'tiempo', almas: n }), 600); });
    function empezar() { if (empezado || fin) return; empezado = true; clk.correr(); }
    const aX = e => { const r = caja.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
    caja.addEventListener('pointerdown', e => { caja.setPointerCapture?.(e.pointerId); xT = aX(e); empezar(); });
    caja.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) { xT = aX(e); if (e.pointerType === 'mouse') empezar(); } });
    caja.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { e.preventDefault(); teclas.add(e.code); empezar(); }
    });
    caja.addEventListener('keyup', e => teclas.delete(e.code));
    caja.addEventListener('blur', () => teclas.clear());

    function nueva() {
      const prog = Math.min(1, n / meta);
      const mala = conCeniza && R() < 0.18 + prog * 0.17;
      almas.push({ mala, x: 0.08 + R() * 0.84, y: -0.05, v: (0.3 + R() * 0.18 + prog * 0.22) * lento * (mala ? 1.12 : 1), f: R() * 6.28, a: 0.03 + R() * 0.06, r: 0.02 + R() * 0.008 });
    }
    function paso(dt) {
      t += dt;
      const k = (teclas.has('ArrowLeft') || teclas.has('KeyA') ? -1 : 0) + (teclas.has('ArrowRight') || teclas.has('KeyD') ? 1 : 0);
      if (k) xT = Math.min(1, Math.max(0, xT + k * 1.1 * dt));
      x += (xT - x) * (1 - Math.exp(-18 * dt));
      if (empezado && !fin) { spawn -= dt; if (spawn <= 0) { nueva(); spawn = (0.56 - Math.min(0.24, n * 0.012)) / lento * (0.7 + R() * 0.6); } }
      const fy = 0.86, fx0 = x - FW / 2, fx1 = x + FW / 2;
      for (let i = almas.length - 1; i >= 0; i--) {
        const a = almas[i]; a.y += a.v * dt; a.f += dt * 2.2;
        const ax = a.x + Math.sin(a.f) * a.a;
        if (!fin && a.mala && a.y > fy - 0.03 && a.y < fy + 0.04 && ax > fx0 && ax < fx1) {
          almas.splice(i, 1); n = Math.max(0, n - castigo); nEl.textContent = n; rojo = 0.45; sfx.error && sfx.error();
          anunciar(m, `Ceniza. Menos ${castigo}. Llevas ${n}.`);
        } else if (!fin && !a.mala && a.y > fy - 0.03 && a.y < fy + 0.04 && ax > fx0 && ax < fx1) {
          almas.splice(i, 1); n++; nEl.textContent = n; sfx('tink', 0.6);
          if (!reducedMotion) for (let j = 0; j < 8; j++) chispas.push({ x: ax, y: fy, vx: (R() - 0.5) * 0.5, vy: -R() * 0.5, v: 1 });
          if (n === meta) anunciar(m, 'Todas las almas.'); else if (n % 5 === 0) anunciar(m, `${n} de ${meta}.`);
          if (n >= meta) { fin = true; clk.parar(); T.despues(() => game.onWin && game.onWin({ ms: Math.round(clk.usado * 1000), almas: n }), 700); }
        } else if (a.y > 1.05) almas.splice(i, 1);
      }
      rojo = Math.max(0, rojo - dt);
      for (let i = chispas.length - 1; i >= 0; i--) { const c = chispas[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 0.6 * dt; c.v -= dt * 1.6; if (c.v <= 0) chispas.splice(i, 1); }
    }
    function dibujar() {
      g.clearRect(0, 0, W, H);
      const s = Math.min(W, H);
      g.fillStyle = '#121318'; g.fillRect(0, H * 0.9, W, H * 0.1);
      for (const a of almas) {
        const ax = (a.x + Math.sin(a.f) * a.a) * W, ay = a.y * H, r = a.r * s;
        if (a.mala) {   // ceniza: rombo rojo con brasa, forma distinta del alma redonda
          g.save(); g.translate(ax, ay); g.rotate(Math.PI / 4 + Math.sin(a.f * 2) * 0.3);
          g.fillStyle = 'rgba(184,71,59,.25)'; g.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
          g.fillStyle = '#b8473b'; g.fillRect(-r, -r, r * 2, r * 2); g.fillStyle = '#2a0f0b'; g.fillRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
          g.restore(); continue;
        }
        if (!reducedMotion) { g.globalAlpha = 0.18; g.fillStyle = '#b9d4ff'; g.beginPath(); g.ellipse(ax - Math.cos(a.f) * a.a * W * 0.15, ay - r * 1.6, r * 0.55, r * 1.6, 0, 0, 6.29); g.fill(); }
        g.globalAlpha = 1;
        const gr = g.createRadialGradient(ax, ay, 0, ax, ay, r * 2.2);
        gr.addColorStop(0, 'rgba(240,248,255,1)'); gr.addColorStop(0.35, 'rgba(170,200,255,.75)'); gr.addColorStop(1, 'rgba(120,150,230,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(ax, ay, r * 2.2, 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
      for (const c of chispas) { g.globalAlpha = Math.max(0, c.v); g.fillStyle = '#ffe2a8'; g.fillRect(c.x * W - 1.5, c.y * H - 1.5, 3, 3); }
      g.globalAlpha = 1;
      const fx = x * W, fy = 0.86 * H, fw = FW * W, fh = Math.max(16, s * 0.05);
      const halo = g.createRadialGradient(fx, fy, 0, fx, fy, fw * 0.9);
      halo.addColorStop(0, 'rgba(255,200,120,.32)'); halo.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(fx, fy, fw * 0.9, 0, 6.29); g.fill();
      if (rojo > 0) { g.fillStyle = `rgba(184,71,59,${rojo * 0.5})`; g.fillRect(0, 0, W, H); }
      g.fillStyle = '#2a2a2f'; g.fillRect(fx - fw / 2, fy - fh * 0.15, fw, fh * 0.3);
      g.fillStyle = '#ffd08a'; g.fillRect(fx - fw * 0.18, fy - fh * 0.15 - fh * 0.75, fw * 0.36, fh * 0.75);
      g.strokeStyle = '#55565c'; g.lineWidth = 2; g.strokeRect(fx - fw * 0.18, fy - fh * 0.15 - fh * 0.75, fw * 0.36, fh * 0.75);
      g.fillStyle = '#55565c'; g.fillRect(fx - fw / 2, fy - fh * 0.15, fw, 3);
      if (!empezado) {
        g.fillStyle = '#c9c3b6'; g.textAlign = 'center'; g.font = '500 13px Oswald, system-ui, sans-serif';
        g.fillText('MUEVE EL FAROL PARA EMPEZAR', W / 2, H * 0.45);
      }
    }
    function loop(tt) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (tt - last) / 1000); last = tt;
      paso(dt); dibujar();
    }
    const game = {
      onWin: null, onLose: null,
      start() { ro.observe(caja); medir(); last = performance.now(); raf = requestAnimationFrame(loop); caja.focus({ preventScroll: true }); },
      destroy() { fin = true; cancelAnimationFrame(raf); T.destroy(); clk.destroy(); ro.disconnect(); root.innerHTML = ''; },
    };
    return game;
  },
});
