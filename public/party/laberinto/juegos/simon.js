// Minijuego: Simon de velas. Repite la secuencia. Mouse, touch y teclado (teclas 1–4, o flechas + Enter).
import { registerMinigame } from './registro.js';
import { estilo, rng, marco, reloj, anunciar, temporizadores } from './comun.js';

estilo('simon-css', `
.sim{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:clamp(8px,3vw,22px);width:100%;align-items:end}
.sim-v{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;min-height:44px;height:min(46vh,280px);padding:0 0 12px;border-radius:14px;border:1px solid #2c2c31;background:#141417;cursor:pointer;color:#8d877b;transition:border-color .15s,background .15s}
.sim-v:hover:not(:disabled){border-color:#6e2c25}
.sim-v:disabled{cursor:default}
.sim-cuerpo{width:26%;height:var(--h);border-radius:6px 6px 3px 3px;background:linear-gradient(90deg,#cfc7b4,#e9e2cf 45%,#bdb5a2)}
.sim-mecha{width:2px;height:10px;background:#2a2622;margin-bottom:-10px}
.sim-llama{width:22%;aspect-ratio:1/1.7;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;background:radial-gradient(circle at 50% 70%,#fff6e2 0 18%,var(--c) 55%,transparent 72%);opacity:.18;transform:scale(.7);transform-origin:50% 100%;transition:opacity .12s,transform .12s}
.sim-v.on{border-color:var(--c);background:#1d1b1a}
.sim-v.on .sim-llama{opacity:1;transform:scale(1.15)}
.sim-v.on::after{content:"";position:absolute;inset:0;border-radius:14px;box-shadow:0 0 38px -6px var(--c);pointer-events:none}
.sim-n{font:600 15px/1 "Oswald",system-ui,sans-serif;letter-spacing:.08em}
.sim-v.on .sim-n{color:#e6e0d4}
.sim-estado{margin:0 0 6px;min-height:20px;font:500 13px/1 "Oswald",system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#c9c3b6;text-align:center}
.sim-vidas{display:inline-flex;gap:5px;vertical-align:middle;margin-left:6px}
.sim-vidas i{width:7px;height:7px;border-radius:50%;background:#d9a35c}
.sim-vidas i.off{background:#3a3a40}
.mg.rm .sim-llama,.mg.rm .sim-v{transition:none}
`);
const COLORES = ['#e8a04a', '#d0675a', '#8ea0d6', '#86b07c', '#c58ad0', '#d6c35a'];
const ALTURAS = ['62%', '48%', '56%', '42%', '52%', '46%'];

registerMinigame({
  id: 'simon',
  title: 'Secuencia de velas',
  seconds: 60,
  create(root, { params = {}, seed = 1, sfx = () => {}, reducedMotion = false } = {}) {
    const n = Math.min(6, Math.max(3, params.velas || 5)), largo = params.largo || 8, total = params.segundos || 60;
    const R = rng(seed), sec = Array.from({ length: largo }, () => Math.floor(R() * n));
    const m = marco(root, { total, etiqueta: `Ronda <b class="sim-r">1</b> / ${largo}<span class="sim-vidas" aria-hidden="true"><i></i><i></i></span>`,
      ayuda: `Mira qué velas se encienden y repítelas en el mismo orden. Llega a ${largo} seguidas. Teclas 1 a ${n}.` });
    if (reducedMotion) m.el.classList.add('rm');
    m.area.innerHTML = `<div style="width:min(520px,100%)"><p class="sim-estado" aria-hidden="true"></p><div class="sim" role="group" aria-label="Velas" style="--n:${n}"></div></div>`;
    const grid = m.area.querySelector('.sim'), estadoEl = m.area.querySelector('.sim-estado'), rEl = m.el.querySelector('.sim-r'), vidasEl = [...m.el.querySelectorAll('.sim-vidas i')];
    const velas = Array.from({ length: n }, (_, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sim-v'; b.tabIndex = i === 0 ? 0 : -1; b.disabled = true;
      b.style.setProperty('--c', COLORES[i]); b.style.setProperty('--h', ALTURAS[i]);
      b.setAttribute('aria-label', `Vela ${i + 1}`);
      b.innerHTML = '<span class="sim-llama"></span><span class="sim-mecha"></span><span class="sim-cuerpo"></span><span class="sim-n">' + (i + 1) + '</span>';
      grid.appendChild(b); return b;
    });
    const T = temporizadores();
    let ronda = 1, pos = 0, vidas = 2, turno = false, fin = false;
    const clk = reloj(m, total, () => { if (fin) return; fin = true; turno = false; bloquear(true); anunciar(m, 'Se acabó el tiempo.'); T.despues(() => game.onLose && game.onLose({ razon: 'tiempo', ronda }), 500); });
    const estado = t => { estadoEl.textContent = t; };
    const bloquear = v => velas.forEach(b => { b.disabled = v; });
    function encender(i, ms) {
      const b = velas[i]; b.classList.add('on'); sfx.nota && sfx.nota(i, ms / 1000 + 0.1);
      T.despues(() => b.classList.remove('on'), ms);
    }
    function mostrar() {
      turno = false; bloquear(true); clk.parar(); pos = 0;
      rEl.textContent = ronda; estado('Observa'); anunciar(m, `Ronda ${ronda}. Observa.`);
      const on = Math.max(240, 470 - ronda * 30), gap = reducedMotion ? 240 : 130;
      let t = 650;
      for (let k = 0; k < ronda; k++) { const i = sec[k]; T.despues(() => encender(i, on), t); t += on + gap; }
      T.despues(() => {
        if (fin) return;
        turno = true; bloquear(false); estado('Tu turno'); anunciar(m, `Tu turno. Repite ${ronda === 1 ? 'la vela' : 'las ' + ronda + ' velas'}.`);
        clk.correr();
        const f = velas.find(b => b.tabIndex === 0); if (f && m.el.contains(document.activeElement)) f.focus({ preventScroll: true });
      }, t);
    }
    function tocar(i) {
      if (!turno || fin) return;
      encender(i, 260);
      if (i !== sec[pos]) {
        sfx.error && sfx.error(); vidas--; vidasEl.forEach((v, k) => v.classList.toggle('off', k >= vidas));
        if (vidas <= 0) {
          fin = true; turno = false; bloquear(true); clk.parar(); estado('Se apagaron');
          anunciar(m, 'Vela equivocada. Se apagaron.');
          T.despues(() => game.onLose && game.onLose({ razon: 'error', ronda }), 700); return;
        }
        estado('Esa no era'); anunciar(m, `Esa no era la vela. Te queda ${vidas} oportunidad. Otra vez.`);
        turno = false; bloquear(true); T.despues(mostrar, 900); return;
      }
      pos++;
      if (pos < ronda) return;
      turno = false; bloquear(true); clk.parar();
      if (ronda === largo) {
        fin = true; estado('Completa'); anunciar(m, 'Secuencia completa.');
        T.despues(() => game.onWin && game.onWin({ ms: Math.round(clk.usado * 1000), rondas: ronda }), 600); return;
      }
      ronda++; estado('Bien'); T.despues(mostrar, 700);
    }
    grid.addEventListener('click', e => { const b = e.target.closest('.sim-v'); if (b) tocar(velas.indexOf(b)); });
    grid.addEventListener('keydown', e => {
      const i = velas.indexOf(document.activeElement); if (i < 0) return;
      const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (d === undefined) return;
      e.preventDefault(); const j = (i + d + n) % n; velas[i].tabIndex = -1; velas[j].tabIndex = 0; velas[j].focus();
    });
    const onKey = e => { const k = +e.key; if (k >= 1 && k <= n && !e.repeat) { e.preventDefault(); tocar(k - 1); } };
    addEventListener('keydown', onKey);
    const game = {
      onWin: null, onLose: null,
      start() { m.el.tabIndex = -1; velas[0].tabIndex = 0; m.el.focus({ preventScroll: true }); mostrar(); },
      destroy() { fin = true; T.destroy(); clk.destroy(); removeEventListener('keydown', onKey); root.innerHTML = ''; },
    };
    return game;
  },
});
