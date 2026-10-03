// Minijuego: cerradura del epitafio. El código sale de leer el epitafio.
// Mouse/touch: flechas de cada dial o deslizar. Teclado: ↑↓ cambian el dígito, ←→ cambian de dial, Enter prueba.
import { registerMinigame } from './registro.js';
import { estilo, marco, reloj, anunciar, temporizadores } from './comun.js';

estilo('cerr-css', `
.cerr{display:flex;flex-direction:column;align-items:center;gap:20px;width:min(460px,100%)}
.cerr-epi{margin:0;padding:18px 20px;border-radius:10px;background:#1b1b1f;border:1px solid #2c2c31;font:400 clamp(16px,2.6vw,19px)/1.55 "Cinzel",Georgia,serif;color:#c9c3b6;text-align:center;text-wrap:pretty}
.cerr-epi mark{background:none;color:#e8b77a;text-decoration:underline;text-decoration-color:rgba(232,183,122,.5);text-underline-offset:4px}
.cerr-candado{display:flex;gap:clamp(8px,3vw,16px);padding:18px clamp(14px,4vw,24px);border-radius:16px;background:#26262b;border:1px solid #3a3a40;box-shadow:inset 0 2px 0 rgba(255,255,255,.04)}
.cerr-candado.mal{animation:cerr-mal .38s}
@keyframes cerr-mal{20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(2px)}}
.cerr-dial{display:flex;flex-direction:column;align-items:center;gap:4px;touch-action:none}
.cerr-dial button{width:56px;min-height:40px;border:0;border-radius:8px;background:transparent;color:#8d877b;font:600 16px/1 "Oswald",system-ui,sans-serif;cursor:pointer}
.cerr-dial button:hover{color:#e6e0d4;background:rgba(255,255,255,.04)}
.cerr-d{width:56px;height:68px;display:grid;place-items:center;border-radius:8px;background:#121215;border:1px solid #44444a;font:600 34px/1 "Oswald",system-ui,sans-serif;color:#e6e0d4;font-variant-numeric:tabular-nums;outline:none;cursor:ns-resize}
.cerr-d:focus-visible{border-color:#c9c3b6;box-shadow:0 0 0 1px #c9c3b6}
.cerr-pista{margin:0;min-height:20px;font:400 14px/1.4 system-ui,-apple-system,sans-serif;color:#a8a296;text-align:center}
.mg.rm .cerr-candado.mal{animation:none;border-color:#b8473b}
`);
const NUM = { cero: 0, una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };

registerMinigame({
  id: 'cerradura',
  title: 'Cerradura del epitafio',
  seconds: 60,
  create(root, { params = {}, sfx = () => {}, reducedMotion = false, epitafio = '' } = {}) {
    const codigo = String(params.codigo || '000'), D = codigo.length, total = params.segundos || 60, castigo = params.castigo || 10, pistaEn = params.pistaEn || 35, pistaTras = params.pistaTras || 3;
    const m = marco(root, { total, etiqueta: 'Intentos <b class="cerr-i">0</b>',
      ayuda: `La combinación está escrita en la lápida. Cada intento fallido quema ${castigo} segundos.` });
    if (reducedMotion) m.el.classList.add('rm');
    const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const epiHtml = esc(epitafio || '');
    m.area.innerHTML = `<div class="cerr">
      <p class="cerr-epi">${epiHtml}</p>
      <div class="cerr-candado" role="group" aria-label="Candado de ${D} diales"></div>
      <button type="button" class="mg-btn cerr-abrir">Abrir</button>
      <p class="cerr-pista" aria-live="polite"></p></div>`;
    const cand = m.area.querySelector('.cerr-candado'), abrir = m.area.querySelector('.cerr-abrir'), pista = m.area.querySelector('.cerr-pista'), epiEl = m.area.querySelector('.cerr-epi'), iEl = m.el.querySelector('.cerr-i');
    const T = temporizadores(), val = Array(D).fill(0);
    let intentos = 0, fin = false, pistaDada = false;
    const diales = val.map((_, i) => {
      const w = document.createElement('div'); w.className = 'cerr-dial';
      w.innerHTML = `<button type="button" tabindex="-1" aria-label="Subir dial ${i + 1}">▲</button><div class="cerr-d" role="spinbutton" tabindex="${i === 0 ? 0 : -1}" aria-valuemin="0" aria-valuemax="9" aria-label="Dial ${i + 1}"></div><button type="button" tabindex="-1" aria-label="Bajar dial ${i + 1}">▼</button>`;
      cand.appendChild(w);
      const [up, d, dn] = w.children;
      up.addEventListener('click', () => cambiar(i, 1)); dn.addEventListener('click', () => cambiar(i, -1));
      let y0 = null;
      d.addEventListener('pointerdown', e => { y0 = e.clientY; d.setPointerCapture?.(e.pointerId); d.focus(); });
      d.addEventListener('pointermove', e => { if (y0 === null) return; const dy = e.clientY - y0; if (Math.abs(dy) > 22) { cambiar(i, dy < 0 ? 1 : -1); y0 = e.clientY; } });
      d.addEventListener('pointerup', () => { y0 = null; }); d.addEventListener('pointercancel', () => { y0 = null; });
      return d;
    });
    const pintar = i => { diales[i].textContent = val[i]; diales[i].setAttribute('aria-valuenow', val[i]); };
    val.forEach((_, i) => pintar(i));
    function cambiar(i, d) { if (fin) return; clk.correr(); val[i] = (val[i] + d + 10) % 10; pintar(i); sfx('click', 0.6); }
    cand.addEventListener('keydown', e => {
      const i = diales.indexOf(document.activeElement); if (i < 0) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); cambiar(i, 1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cambiar(i, -1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); const j = Math.min(D - 1, Math.max(0, i + (e.key === 'ArrowLeft' ? -1 : 1)));
        diales[i].tabIndex = -1; diales[j].tabIndex = 0; diales[j].focus();
      } else if (/^[0-9]$/.test(e.key)) { val[i] = +e.key; pintar(i); clk.correr(); if (i < D - 1) { diales[i].tabIndex = -1; diales[i + 1].tabIndex = 0; diales[i + 1].focus(); } }
      else if (e.key === 'Enter') { e.preventDefault(); probar(); }
    });
    function darPista() {
      if (pistaDada) return; pistaDada = true;
      // Resalta las palabras-número del epitafio, en orden
      epiEl.innerHTML = epiHtml.replace(/[a-záéíóúñ]+/gi, w => (w.toLowerCase() in NUM ? `<mark>${w}</mark>` : w));
      pista.textContent = 'Pista: cuenta lo que esperó, en orden.';
    }
    function probar() {
      if (fin) return; clk.correr();
      intentos++; iEl.textContent = intentos;
      if (val.join('') === codigo) {
        fin = true; clk.parar(); sfx('tink'); T.despues(() => sfx('thud', 0.6), 160);
        pista.textContent = 'El candado cede.';
        T.despues(() => game.onWin && game.onWin({ ms: Math.round(clk.usado * 1000), intentos }), 800); return;
      }
      sfx.error && sfx.error(); clk.restar(castigo);
      cand.classList.remove('mal'); void cand.offsetWidth; cand.classList.add('mal');
      pista.textContent = `No cede. −${castigo} segundos.`;
      if (intentos >= pistaTras) T.despues(darPista, 900);
    }
    abrir.addEventListener('click', probar);
    const clk = reloj(m, total, () => { if (fin) return; fin = true; anunciar(m, 'Se acabó el tiempo.'); T.despues(() => game.onLose && game.onLose({ razon: 'tiempo', intentos }), 500); });
    const pistaT = setInterval(() => { if (!fin && clk.usado > pistaEn) darPista(); }, 1000);
    const game = {
      onWin: null, onLose: null,
      start() { diales[0].focus({ preventScroll: true }); },
      destroy() { fin = true; clearInterval(pistaT); T.destroy(); clk.destroy(); root.innerHTML = ''; },
    };
    return game;
  },
});
