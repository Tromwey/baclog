// Laberinto montable: crea su propio DOM (prefijo lab-), renderer, HUD, diálogos, minijuegos y sellos.
// Uso: const { lab, desmontar } = await montarLaberinto({ host: document.body, entrada: true, dev: true });
import * as THREE from '../vendor/three.module.min.js';
import { crearLaberinto, GLIFOS } from './motor.js';
import { crearApi } from './api.js';
import { crearSfx } from './sfx.js';
import { disponible, cargarMinijuego } from './juegos/registro.js';
import { cargarLogros, crearLogros, crearAvisoLogros } from './logros.js';
import { dorsoCarta } from './cartas.js';   // [Kura] dorso de carta para el inventario

const BASE = new URL('./', import.meta.url);
const KEY = 'lab.v1';

const HTML = `
<div class="lab-stage" data-r="stage" tabindex="-1" aria-label="Laberinto"></div>
<div class="lab-hud">
  <div class="lab-izq">
    <button class="lab-pill" type="button" data-r="btnPausa">Pausa</button>
  </div>
  <div class="lab-der">
    <button type="button" class="lab-mini" data-r="mini" aria-label="Abrir mapa (M)"><canvas width="304" height="304" data-r="miniCv" aria-hidden="true"></canvas><span class="lab-n" aria-hidden="true">N</span></button>
    <button type="button" class="lab-pill lab-ruta" data-r="btnRuta" aria-pressed="false">Ruta al Mausoleo</button>
  </div>
</div>
<div class="lab-inv" data-r="invBar" hidden>
  <p class="lab-sr" role="status" data-r="invT">Encargos <b data-r="invN">0/3</b></p>
  <div class="lab-inv-sello" role="status" data-r="invSello" hidden><div class="lab-sello lab-sello-inv" aria-hidden="true">★</div><b data-r="invSelloN" aria-hidden="true">0</b></div>
  <div class="lab-inv-carta" role="status" data-r="cartasP" hidden><canvas width="92" height="144" data-r="cartasCv" aria-hidden="true"></canvas><b data-r="cartasN" aria-hidden="true">0</b></div><!-- [Kura] cartas en el inventario -->
  <span class="lab-inv-sync" data-r="invSync" hidden>Sincronizando</span>
  <div class="lab-inv-foto" data-r="invFoto" role="button" tabindex="-1" hidden><canvas width="320" height="240" data-r="invFotoCv" aria-hidden="true"></canvas><b data-r="invFotoN" aria-hidden="true">0/4</b></div>
  <div class="lab-inv-l" role="list" aria-label="Inventario" data-r="invL"></div>
</div>
<div class="lab-info lab-mono" data-r="info" hidden></div>
<div class="lab-dev" data-r="dev" hidden>
  <button type="button" class="lab-dev-t" data-r="devT" aria-expanded="false">Dev</button>
  <span class="lab-badge lab-mono" data-r="badge">FASE 4</span>
  <div class="lab-seg" role="group" aria-label="Red simulada"><button type="button" data-red="ok">Red ok</button><button type="button" data-red="lenta">Lenta</button><button type="button" data-red="falla">Sin red</button></div>
  <div class="lab-seg" role="group" aria-label="Luz"><button type="button" data-luz="noche">Noche</button><button type="button" data-luz="prueba">Luz de prueba</button></div>
  <button type="button" data-r="devIr">Ir a lápida</button>
  <button type="button" data-r="devPuerta">Ir a la puerta</button>
  <button type="button" data-r="devGatos">Traer gatos</button>
  <button type="button" data-r="devAparicion">Aparición</button>
  <button type="button" data-r="devOjos">Ojos</button>
  <button type="button" data-r="devObjeto">Ir a objeto</button>
  <button type="button" data-r="devCarta">Ir a carta</button>
  <button type="button" data-r="devCuervo">Ir a cuervo</button>
  <button type="button" data-r="devCalabaza">Ir a calabaza</button>
  <button type="button" data-r="devGatoB">Ir al gato blanco</button>
  <button type="button" data-r="devBaile">Baile de la calabaza</button>
  <button type="button" data-r="devSecretos">Borrar cuervos y calabaza</button>
  <button type="button" data-r="devTumba">Ir a tumba</button>
  <button type="button" data-r="devFinal">Probar final</button>
  <button type="button" data-r="devPieza">Ir a pedazo de foto</button>
  <button type="button" data-r="devCaja">Ir a caja</button>
  <button type="button" data-r="devFotoT">Juntar foto</button>
  <button type="button" data-r="devPistas">Borrar pistas</button>
  <button type="button" data-r="devRayo">Rayo</button>
  <button type="button" data-r="devDeco" aria-pressed="true">Detalles</button>
  <label class="lab-rng">Haz <input type="range" data-r="linTam" min="5" max="40" step="1"><output class="lab-mono" data-r="linTamO"></output></label>
  <label class="lab-rng">Intensidad <input type="range" data-r="linInt" min="0" max="250" step="5"><output class="lab-mono" data-r="linIntO"></output></label>
  <button type="button" data-r="devCompleto" aria-pressed="false">Mapa completo</button>
  <button type="button" data-r="devInfo" aria-pressed="false">Info</button>
  <button type="button" data-r="devOlvidar">Olvidar mapa</button>
  <button type="button" data-r="devBorrar">Borrar sellos</button>
  <button type="button" data-r="devEncargos">Borrar encargos</button>
  <button type="button" data-r="devCartas">Borrar cartas</button>
  <button type="button" data-r="devReset">Reiniciar posición</button>
</div>
<div class="lab-mira" data-r="mira"></div>
<div class="lab-prompt" data-r="prompt" hidden><kbd>E</kbd><span data-r="promptT"></span></div>
<button class="lab-pill lab-accion" type="button" data-r="accion" hidden>Leer</button>
<div class="lab-joy" data-r="joy"><i data-r="knob"></i></div>
<div class="lab-guia" data-r="guia" aria-hidden="true"><span>Arrastra · caminar</span><span>Arrastra · mirar</span></div>
<div class="lab-paso" data-r="paso"></div>
<div class="lab-rayo" data-r="rayo" aria-hidden="true"></div>
<div class="lab-susto" data-r="susto" aria-hidden="true"><img src="/party/cat-jumpscare.jpg" alt="" decoding="sync"></div><!-- [Kura] foto del susto -->
<div class="lab-msg" data-r="msg"></div>
<p class="lab-sr" data-r="live" aria-live="polite"></p>

<section class="lab-capa lab-entrada" data-r="entrada" role="button" tabindex="0" aria-label="Encuentra el Mausoleo. Haz clic o toca para empezar." hidden>
  <h2>Encuentra el Mausoleo</h2>
  <p class="lab-cta"><span class="lab-solo-mouse">Haz clic para entrar</span><span class="lab-solo-touch">Toca para entrar</span></p>
  <dl class="lab-leyenda lab-solo-mouse"><dt>WASD · flechas</dt><dd>Caminar</dd><dt>Mouse · ← →</dt><dd>Mirar</dd><dt>E · clic</dt><dd>Leer lápida</dd><dt>M</dt><dd>Mapa</dd><dt>Esc</dt><dd>Pausa</dd></dl>
  <dl class="lab-leyenda lab-solo-touch"><dt>Izquierda</dt><dd>Caminar</dd><dt>Derecha</dt><dd>Mirar</dd><dt>Botón</dt><dd>Leer lápida</dd></dl>
</section>

<section class="lab-capa lab-hallazgo" data-r="hall" role="button" tabindex="0" hidden>
  <div class="lab-box">
    <h2 data-r="hT"></h2>
    <p data-r="hP"></p>
    <div class="lab-item" data-r="hItem" aria-hidden="true"></div>
    <p class="lab-h-cta"><span class="lab-solo-mouse">Haz clic para guardarlo</span><span class="lab-solo-touch">Toca para guardarlo</span></p>
  </div>
</section>

<section class="lab-capa lab-hallazgo lab-foto" data-r="foto" role="button" tabindex="0" hidden>
  <div class="lab-box">
    <div class="lab-foto-marco" data-r="fotoMarco" aria-hidden="true"></div>
    <h2 data-r="fotoT"></h2>
    <p class="lab-h-cta"><span class="lab-solo-mouse">Haz clic para cerrar</span><span class="lab-solo-touch">Toca para cerrar</span></p>
  </div>
</section>

<section class="lab-capa" data-r="pausa" role="dialog" aria-modal="true" aria-label="Pausa" hidden>
  <div class="lab-card">
    <h2>Pausa</h2>
    <div class="lab-fila"><span>Giro</span><div class="lab-seg2" role="group" aria-label="Giro"><button type="button" data-p-giro="suave">Suave</button><button type="button" data-p-giro="pasos">Por pasos</button></div></div>
    <div class="lab-fila"><span>Tamaño del paso</span><div class="lab-seg2" role="group" aria-label="Tamaño del paso"><button type="button" data-p-paso="30">30°</button><button type="button" data-p-paso="45">45°</button><button type="button" data-p-paso="90">90°</button></div></div>
    <div class="lab-fila"><label for="lab-sens">Sensibilidad · <output data-r="sensO"></output></label><input type="range" id="lab-sens" data-r="sens" min="0.4" max="2" step="0.1"></div>
    <label class="lab-check"><input type="checkbox" data-r="inv"> Invertir eje vertical</label>
    <div class="lab-fila" hidden><label for="lab-lt">Linterna · tamaño del haz · <output data-r="ltO"></output></label><input type="range" id="lab-lt" data-r="lt" min="5" max="40" step="1"></div>
    <div class="lab-fila" hidden><label for="lab-li">Linterna · intensidad · <output data-r="liO"></output></label><input type="range" id="lab-li" data-r="li" min="0" max="250" step="5"></div>
    <div class="lab-fila" hidden><label for="lab-ll">Linterna · alcance · <output data-r="llO"></output></label><input type="range" id="lab-ll" data-r="ll" min="6" max="40" step="1"></div>
    <div class="lab-fila" hidden><label for="lab-lp">Linterna · borde suave · <output data-r="lpO"></output></label><input type="range" id="lab-lp" data-r="lp" min="0" max="100" step="5"></div>
    <div class="lab-acciones"><button class="lab-pill" type="button" data-r="seguir">Continuar</button></div>
    <p class="lab-nota lab-solo-mouse">Esc libera el mouse. Con el teclado puedes jugar sin mouse.</p>
  </div>
</section>

<section class="lab-capa lab-mapa" data-r="mapa" role="dialog" aria-modal="true" aria-label="Mapa del laberinto" hidden>
  <div class="lab-card">
    <h2>Mapa</h2>
    <canvas width="1024" height="1024" data-r="mapaCv" aria-hidden="true"></canvas>
    <p class="lab-sr" data-r="mapaDesc"></p>
    <div class="lab-ley" aria-hidden="true"><span><i style="background:#fff"></i>Tú</span><span><i style="background:#a8443a"></i>Lápida</span><span><i style="background:#efd9a6"></i>Resuelta</span><span><i style="background:#e0443a;border-radius:2px"></i>Mausoleo</span><span><i style="background:#e8902a"></i>Ruta</span></div>
    <div class="lab-acciones"><button class="lab-pill" type="button" data-r="mapaRuta" aria-pressed="false">Ruta al Mausoleo</button><button class="lab-pill" type="button" data-r="mapaCerrar">Cerrar</button></div>
  </div>
</section>

<section class="lab-capa lab-panel" data-r="panel" role="dialog" aria-modal="true" aria-labelledby="lab-panel-nombre" hidden>
  <div class="lab-card">
    <h2 class="lab-panel-nombre" id="lab-panel-nombre" data-r="pNombre"></h2>
    <p class="lab-panel-fechas" data-r="pFechas"></p>
    <p class="lab-panel-epitafio" data-r="pEpitafio"></p>
    <div class="lab-panel-estado" data-r="pEstado" hidden><div class="lab-sello chico" data-r="pSello" aria-hidden="true"></div><span>Tienes este sello</span></div>
    <div class="lab-acciones"><button class="lab-pill" type="button" data-r="pJugar">Jugar</button><button class="lab-pill" type="button" data-r="pVolver">Volver</button></div>
    <p class="lab-nota lab-mono" data-r="pNota"></p>
  </div>
</section>

<section class="lab-capa lab-juego" data-r="juego" role="dialog" aria-modal="true" aria-labelledby="lab-juego-t" hidden>
  <div class="lab-juego-marco" data-r="jMarco">
    <header class="lab-juego-cab"><div><p data-r="jLapida"></p><h2 id="lab-juego-t" data-r="jT"></h2></div><button class="lab-pill" type="button" data-r="jSalir">Abandonar</button></header>
    <div class="lab-juego-root" data-r="jRoot"></div>
  </div>
  <div class="lab-fin" data-r="fin" hidden>
    <div class="lab-card">
      <div class="lab-sello" data-r="fSello" aria-hidden="true" hidden></div>
      <h2 class="lab-fin-t" data-r="fT"></h2>
      <p class="lab-fin-p" data-r="fP"></p>
      <p class="lab-nota lab-mono" data-r="fEstado" role="status"></p>
      <form class="lab-campo" data-r="fApodo" hidden>
        <label for="lab-apodo">Tu apodo</label>
        <input id="lab-apodo" data-r="apodoIn" maxlength="24" autocomplete="nickname" required>
        <p class="lab-nota">Para guardar tus sellos a tu nombre.</p>
        <div class="lab-acciones"><button class="lab-pill" type="submit">Guardar</button><button class="lab-pill" type="button" data-r="apodoNo">Ahora no</button></div>
      </form>
      <div class="lab-acciones"><button class="lab-pill" type="button" data-r="fOtra" hidden>Reintentar</button><button class="lab-pill" type="button" data-r="fVolver">Volver al laberinto</button></div>
    </div>
  </div>
</section>
<div class="lab-velo" data-r="velo"></div>`;

function cargarCss() {
  const href = new URL('app.css', BASE).href;
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise(res => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res;
    document.head.appendChild(l); setTimeout(res, 2500);
  });
}

export async function montarLaberinto({
  renderer = null, host = document.body, mapaUrl = new URL('mapa.json', BASE).href,
  entrada = true, dev = false, mausoleoUrl = null, onMausoleo = null, apiBase = null, red = 'ok', luz = 'noche', tema = null,
} = {}) {
  const q = new URLSearchParams(location.search);
  const coarse = matchMedia('(pointer:coarse)').matches, reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [json, logrosDef] = await Promise.all([
    fetch(mapaUrl, { cache: 'no-cache' }).then(r => r.json()),
    cargarLogros(new URL('../mausoleo/logros.json', BASE).href),
    cargarCss(),
    Promise.race([Promise.all(['700 20px Cinzel', '400 20px Cinzel', '500 12px Oswald'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]).catch(() => {}),
  ]);

  const temaF = tema || q.get('tema') || 'muros';
  const ui = document.createElement('div'); ui.className = 'lab'; ui.innerHTML = HTML; host.appendChild(ui);
  const $ = {}; ui.querySelectorAll('[data-r]').forEach(n => { $[n.dataset.r] = n; });
  const $$ = s => [...ui.querySelectorAll(s)];
  ui.dataset.input = coarse ? 'touch' : 'mouse';
  const onInput = e => { ui.dataset.input = e.pointerType === 'mouse' ? 'mouse' : 'touch'; };
  addEventListener('pointerdown', onInput, true);

  // ---------- Caché local ----------
  const cache = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })();
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {} };
  const ajustes = Object.assign({ giro: 'suave', pasoGrados: 45, sensibilidad: 1, invertirY: false }, cache.ajustes);
  if (q.get('giro')) ajustes.giro = q.get('giro');
  cache.ajustes = ajustes;
  if (!cache.dispositivo) cache.dispositivo = crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  cache.explorado = cache.explorado || {};
  cache.encargos = cache.encargos || {};
  cache.cartas = cache.cartas || {};
  cache.cuervos = cache.cuervos || {};
  cache.pistas = cache.pistas || {};
  guardar();
  const sfx = crearSfx();
  // Logros: aviso en pantalla la primera vez que se consigue cada uno (lo que ya había antes no se anuncia)
  const LOGROS = crearLogros({ logros: logrosDef, mapa: json, cache, guardar }), avisoLogros = crearAvisoLogros(ui, { cache, guardar, sfx });
  let revLogT = 0; const revisarLogros = () => { clearTimeout(revLogT); revLogT = setTimeout(() => avisoLogros.avisar(LOGROS.nuevos()), 450); };
  LOGROS.nuevos();

  // ---------- Renderer y motor ----------
  const propio = !renderer;
  if (propio) {
    renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  }
  $.stage.appendChild(renderer.domElement);
  const live = $.live;
  $.invBar.hidden = false;
  let msgT = 0;
  function mensaje(t, ms = 2600) { $.msg.textContent = t; live.textContent = t; $.msg.classList.add('on'); clearTimeout(msgT); msgT = setTimeout(() => $.msg.classList.remove('on'), ms); }
  function flashPaso() {
    const el = $.paso; el.style.transition = 'none'; el.style.opacity = '.55';
    void el.offsetWidth; el.style.transition = 'opacity .14s ease-out'; el.style.opacity = '0';
  }
  const etiqueta = t => t.tipo === 'lapida' || t.tipo === 'tumba' ? 'Leer lápida' : t.tipo === 'reja' ? 'Tocar la reja' : t.tipo === 'objeto' ? t.recoger : t.tipo === 'gato' ? t.enc.dar : t.tipo === 'caricia' ? '¿Acariciar?' : t.tipo === 'carta' ? 'Recoger la carta' : t.tipo === 'calabaza' ? 'Esto no estaba aquí antes… ¿acaso esto es…?' : t.tipo === 'gatoBlanco' ? 'Molestarlo' : t.tipo === 'pieza' ? 'Recoger el pedazo de foto' : t.tipo === 'caja' ? 'Recoger la caja de música' : 'Entrar al ' + (t.nombre || 'Mausoleo');
  const BOTON = { lapida: 'Leer', reja: 'Tocar', objeto: 'Tomar', gato: 'Dar', caricia: 'Acariciar', carta: 'Tomar', calabaza: '¿…?', gatoBlanco: 'Molestar', tumba: 'Leer', pieza: 'Tomar', caja: 'Tomar' };
  function pintarObjetivo(t, silencio) {
    $.prompt.hidden = $.accion.hidden = !t; $.mira.classList.toggle('on', !!t);
    if (!t) return;
    $.promptT.textContent = etiqueta(t) + (t.sellada ? ' · resuelta' : '');
    $.accion.textContent = BOTON[t.tipo] || 'Entrar';
    if (!silencio) live.textContent = t.tipo === 'reja' ? 'Reja de entrada, cerrada. Pulsa E para tocarla.' : t.tipo === 'lapida' ? `Lápida de ${t.nombre}${t.sellada ? ', resuelta' : ''}. Pulsa E para leer.` : t.tipo === 'carta' ? 'Una carta en el suelo. Pulsa E para recogerla.' : t.tipo === 'calabaza' ? 'Esto no estaba aquí antes. Pulsa E para acercarte.' : t.tipo === 'gatoBlanco' ? 'Un gato blanco en el árbol. No debería molestarlo.' : t.tipo === 'tumba' ? `Lápida de ${t.nombre}. Pulsa E para leer.` : t.tipo === 'caricia' ? `¿Acariciar${t.enc && t.enc.nombreGato ? ' a ' + t.enc.nombreGato : ''}? Pulsa E.` : t.tipo === 'objeto' || t.tipo === 'gato' ? `${etiqueta(t)}. Pulsa E.` : `Puerta del ${t.nombre || 'Mausoleo'}. Pulsa E para entrar.`;
  }
  const lab = crearLaberinto({
    renderer, json, stage: $.stage, ajustes, sfx, tema: temaF, pos: cache.pos && cache.pos.v === json.version ? cache.pos : null, explorado: cache.explorado[json.version], estadoEncargos: cache.encargos, estadoCartas: cache.cartas, estadoSecretos: { cuervos: cache.cuervos, calabaza: !!cache.calabaza, calabazaActiva: (json.encargos || []).length > 0 && (json.encargos || []).every(e => cache.encargos[e.id] === 'entregado') }, estadoPistas: cache.pistas,
    joy: { base: $.joy, knob: $.knob },
    on: {
      objetivo: t => pintarObjetivo(t),
      gatoBlanco(e) {
        if (e === 'visto') mensaje('No debería molestarlo.', 2600);
        else if (e === 'susto') { $.msg.classList.remove('on'); const el = $.susto; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
        else if (e === 'fin') setTimeout(() => mensaje('No debí molestarlo.', 2600), 350);
      },
      cuervo(id, n, tot) { cache.cuervos[id] = true; guardar(); revisarLogros(); mensaje(n >= tot ? 'Creo que esos son todos.' : (['Un cuervo. ¿Cuántos habrá? Puedo escucharlos cerca.', 'Al menos son 2.', 'Van 3.'][n - 1] || `Van ${n}.`), 3200) /* [Kura] textos del founder */; },
      interactuar: t => interactuar(t),
      desbloqueo() { if (!dialogo) abrirPausa(); },
      bloqueo(l) { ui.dataset.lock = l ? '1' : '0'; },
      bloqueoFallido() { mensaje('Arrastra con el mouse para mirar. Clic para interactuar.', 4200); },
      paso: flashPaso,
      toque() { $.guia.classList.add('off'); },
      explorar() { cache.explorado[json.version] = lab.explorado(); },
      foto() { Object.keys(miniaturas).forEach(k => { if (/^foto/.test(k)) delete miniaturas[k]; }); pintarPistas(); },
      evento(e) {
        if (e === 'sigueme') mensaje('Creo que quiere que lo siga.', 4200);
        else if (e === 'acostados') { const r = $.rayo; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); cache.gatosTumba = true; guardar(); setTimeout(revisarLogros, 1800); /* [Kura] */ }
        else if (e === 'acostadosYa' && !cache.gatosTumba) { cache.gatosTumba = true; guardar(); revisarLogros(); /* [Kura] */ }   // el rayo ciega la pantalla
      },
    },
  });

  // ---------- Diálogos ----------
  let dialogo = null;
  function abrir(el, foco) {
    dialogo = el; el.hidden = false; lab.pausar(true);
    if (document.pointerLockElement) document.exitPointerLock();
    foco && foco.focus();
  }
  function cerrar(relock) {
    if (!dialogo) return;
    dialogo.hidden = true; dialogo = null; lab.pausar(false); $.stage.focus({ preventScroll: true });
    if (relock) lab.bloquear();
  }
  function trampa(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (dialogo === $.juego) salirJuego(); else if (dialogo === $.hall) guardarHallazgo(false); else if (dialogo === $.foto) cerrarFoto(false); else cerrar(false); return; }
    if (e.key !== 'Tab') return;
    const f = [...dialogo.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')].filter(x => x.offsetParent && !x.closest('[inert]'));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
  const onKey = e => {
    if (dialogo) {
      if (dialogo === $.mapa && e.code === 'KeyM') { e.preventDefault(); cerrar(true); return; }
      if (dialogo === $.hall && !e.repeat && (e.code === 'KeyE' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); guardarHallazgo(true); return; }
      if (dialogo === $.foto && !e.repeat && (e.code === 'KeyE' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cerrarFoto(true); return; }
      return trampa(e);
    }
    if (!$.entrada.hidden) return;
    if (e.key === 'Escape' && !lab.bloqueado) abrirPausa();
    if (e.code === 'KeyM' && !e.repeat && !(e.target.closest && e.target.closest('input'))) abrirMapa();
  };
  addEventListener('keydown', onKey);

  // ---------- Lápidas ----------
  const inicial = n => (n.replace(/^(Fray|Hermanas|Doña|Don)\s+/i, '')[0] || '?').toUpperCase();
  let panelL = null;
  function abrirPanel(l) {
    panelL = l; panelTumba = null; $.pJugar.hidden = false; $.pFechas.removeAttribute('aria-label'); clearInterval(glitchI);
    const sellada = !!sellos[l.id], hay = disponible(l.juego);
    $.pNombre.textContent = l.nombre; $.pFechas.textContent = l.fechas || ''; $.pEpitafio.textContent = l.epitafio || '';
    $.pEstado.hidden = !sellada; $.pSello.textContent = '★';
    $.pJugar.disabled = !hay; $.pJugar.textContent = sellada ? 'Jugar de nuevo' : 'Jugar';
    $.pNota.textContent = !hay ? 'Este minijuego todavía no existe.' : sellada ? 'Jugar de nuevo no da otro sello.' : (l.params && l.params.segundos === 0) ? 'Minijuego · sin límite de tiempo' : `Minijuego · ${(l.params && l.params.segundos) || 60} s`;
    abrir($.panel, hay ? $.pJugar : $.pVolver);
  }
  // Tumba final: solo se lee (nombre, fechas y la pista), sin minijuego
  let glitchI = 0;
  function abrirTumba(t) {
    panelL = null; $.pNombre.textContent = t.nombre; $.pEpitafio.textContent = t.epitafio || '';
    $.pFechas.textContent = ''; $.pFechas.removeAttribute('aria-label'); clearInterval(glitchI);
    const corte = t.glitch && t.fechas ? t.fechas.indexOf(t.glitch) : -1;
    if (corte < 0) $.pFechas.textContent = t.fechas || '';
    else {   // la fecha de muerte nunca se muestra: glifos al azar que cambian a saltos
      const pre = t.fechas.slice(0, corte), sp = document.createElement('span'), n = t.glitch.length;
      sp.className = 'lab-glitch'; sp.setAttribute('aria-hidden', 'true'); $.pFechas.append(pre, sp); $.pFechas.setAttribute('aria-label', pre + 'fecha ilegible');
      const tick = () => { if ($.panel.hidden) { clearInterval(glitchI); return; } let s = ''; for (let i = 0; i < n; i++) s += GLIFOS[Math.floor(Math.random() * GLIFOS.length)]; sp.textContent = s; };
      tick(); glitchI = setInterval(tick, reducido ? 400 : 90);
    }
    $.pEstado.hidden = true; $.pJugar.hidden = true; $.pNota.textContent = ''; abrir($.panel, $.pVolver);
  }
  $.pVolver.addEventListener('click', () => cerrar(true));
  // Tumbas que solo se leen; si llevas la caja de música aparece "Dejar la caja de música"
  let panelTumba = null;
  function abrirTumbaLeer(t) {
    panelL = null; panelTumba = t; clearInterval(glitchI); $.pFechas.removeAttribute('aria-label');
    $.pNombre.textContent = t.nombre; $.pFechas.textContent = t.fechas || ''; $.pEpitafio.textContent = t.epitafio || ''; $.pEstado.hidden = true; $.pNota.textContent = '';
    const c = lab.pistas.caja, lleva = c && c.estado === 'llevas';
    $.pJugar.hidden = !lleva; $.pJugar.disabled = false; if (lleva) $.pJugar.textContent = c.dejar || 'Dejar la caja de música';
    abrir($.panel, lleva ? $.pJugar : $.pVolver);
  }
  function dejarCaja(t) {
    const c = lab.pistas.caja; if (!c || c.estado !== 'llevas') return;
    if (t.id !== c.tumba) { $.pNota.textContent = c.error || 'No parece ser aquí.'; return; }
    lab.dejarCaja(t.id); cache.pistas.caja = 'entregada'; guardar(); revisarLogros(); cerrar(true); pintarPistas(); mensaje(c.exito || '', 4200);
  }
  $.pJugar.addEventListener('click', () => panelTumba ? dejarCaja(panelTumba) : panelL && jugar(panelL));
  function entrarMausoleo() {
    if (onMausoleo) return onMausoleo();
    if (mausoleoUrl) { $.velo.classList.remove('fuera'); setTimeout(() => { location.href = mausoleoUrl; }, 600); return; }
    mensaje('El Mausoleo es otra página. Se construye después.');
  }
  const MSG_REJA = ['Está cerrada.', 'Desde adentro no abre.', 'La salida es el Mausoleo.', 'Insistir no la abre.'];
  function tocarReja() { const n = lab.sacudirReja(); if (sfx.cadena) sfx.cadena(n); mensaje(MSG_REJA[n <= 4 ? n - 1 : 1 + ((n - 2) % 3)], 2400); }
  function interactuar(t) { if (t.tipo === 'lapida') abrirPanel(t); else if (t.tipo === 'reja') tocarReja(); else if (t.tipo === 'objeto') recoger(t); else if (t.tipo === 'gato') entregar(t); else if (t.tipo === 'caricia') acariciar(t); else if (t.tipo === 'carta') recogerCarta(t); else if (t.tipo === 'calabaza') recogerCalabaza(); else if (t.tipo === 'gatoBlanco') lab.asustar(); else if (t.tipo === 'tumba') { if (t.final) mensaje(t.texto || '¿Cómo y cuándo murió?', 4000); else abrirTumbaLeer(t); } else if (t.tipo === 'pieza') recogerPieza(t); else if (t.tipo === 'caja') recogerCaja(t); else entrarMausoleo(); }
  $.accion.addEventListener('click', () => { const t = lab.estado().objetivo; if (t) interactuar(t); });

  // ---------- Encargos de los gatos (solo en este dispositivo, por ahora no van al servidor) ----------
  // Inventario lateral: un espacio por encargo (vacío → lo llevas → entregado), con miniatura del objeto
  let slots = null;
  function pintarEncargos(nuevo) {
    const l = lab.encargos, est = cache.encargos, n = l.filter(e => est[e.id] === 'entregado').length;
    if (!l.length) return;
    if (!slots) slots = l.map(e => {
      const d = document.createElement('div'), im = document.createElement('img');
      d.className = 'lab-slot'; d.setAttribute('role', 'listitem'); im.alt = ''; d.appendChild(im); $.invL.appendChild(d); return { d, im, e };
    });
    slots.forEach(({ d, im, e }) => {
      const s = est[e.id] || 'vacio'; d.dataset.estado = s;
      if (s === 'vacio') im.removeAttribute('src'); else if (!im.hasAttribute('src')) im.src = miniatura(e.id);
      d.setAttribute('aria-label', s === 'vacio' ? 'Espacio vacío' : `${e.objeto}${s === 'llevas' ? ', lo llevas' : ', entregado'}`);
      if (nuevo === e.id) { d.classList.remove('nuevo'); void d.offsetWidth; d.classList.add('nuevo'); }
    });
    $.invN.textContent = `${n}/${l.length}`;
    $.invT.setAttribute('aria-label', `Encargos: ${n} de ${l.length} entregados.`);
  }
  // Tweaks: cómo se anuncia el hallazgo y si se ve el inventario
  const TW = { hallazgo: 'pantalla', inventario: true };
  function recoger(t) {
    lab.recoger(t.id); cache.encargos[t.id] = 'llevas'; guardar();
    if (TW.hallazgo === 'mensaje') { pintarEncargos(t.id); sfx('tink'); mensaje(t.hallazgo, 5200); } else { pintarEncargos(); verHallazgo(t); }
  }
  // Hallazgo: el objeto gira y flota como la linterna de la entrada; tocar lo guarda y se va a la mano
  let hall = null;
  function escenaItem() {
    if (!hall) {
      const R = new THREE.WebGLRenderer({ antialias: true, alpha: true }); R.setPixelRatio(Math.min(devicePixelRatio, 2)); $.hItem.appendChild(R.domElement);
      const S = new THREE.Scene(), C = new THREE.PerspectiveCamera(30, 1, 0.1, 20); C.position.set(0, 0.35, 4.4); C.lookAt(0, 0, 0);
      S.add(new THREE.HemisphereLight(0xb9c2d6, 0x1a1a1e, 1.1));
      const key = new THREE.DirectionalLight(0xffe2b0, 2.4); key.position.set(2, 3, 3); S.add(key);
      const rim = new THREE.DirectionalLight(0x9aa6c4, 1.4); rim.position.set(-3, 1, -2); S.add(rim);
      const pivot = new THREE.Group(); S.add(pivot);
      hall = { R, S, C, pivot, raf: 0, modelo: null, t0: 0, id: null, ro: new ResizeObserver(() => { const w = $.hItem.clientWidth; if (w) R.setSize(w, w, false); }) };
      hall.ro.observe($.hItem);
    }
    return hall;
  }
  function ponerModelo(id) {
    const H = escenaItem(); if (H.modelo) H.pivot.remove(H.modelo);
    const m = lab.esSecreto(id) ? lab.modeloSecreto(id) : lab.esCarta(id) ? lab.modeloCarta(id) : /^(foto\d|caja)$/.test(id) ? lab.modeloPista(id) : lab.modeloEncargo(id), caja = new THREE.Box3().setFromObject(m), tam = caja.getSize(new THREE.Vector3()), cen = caja.getCenter(new THREE.Vector3());
    const k = 1.5 / (Math.max(tam.x, tam.y, tam.z) || 1); m.scale.multiplyScalar(k); m.position.copy(cen).multiplyScalar(-k);
    const h = new THREE.Group(); h.add(m); h.rotation.set(0.12, 0, 0.2); H.pivot.add(h); H.modelo = h;
  }
  // Miniatura para el inventario: un cuadro fijo del mismo modelo, con la misma luz
  const miniaturas = {};
  function miniatura(id) {
    if (miniaturas[id]) return miniaturas[id];
    const H = escenaItem(); ponerModelo(id); H.pivot.rotation.y = 0.7; H.pivot.position.y = 0;
    H.R.setSize(128, 128, false); H.R.render(H.S, H.C);
    const url = H.R.domElement.toDataURL('image/png');
    try { const mm = JSON.parse(localStorage.getItem('lab.mini')) || {}; mm[id] = url; localStorage.setItem('lab.mini', JSON.stringify(mm)); } catch (_) {}   /* [Kura] para el Mausoleo */
    return (miniaturas[id] = url);
  }
  function verHallazgo(t) {
    const H = escenaItem(); ponerModelo(t.id); H.id = t.id;
    $.hT.textContent = t.objeto; $.hP.textContent = t.para || '';
    $.hall.setAttribute('aria-label', `${t.hallazgo} ${$.hall.querySelector(ui.dataset.input === 'touch' ? '.lab-solo-touch' : '.lab-solo-mouse').textContent}.`);
    $.hall.classList.remove('out'); hall.t0 = performance.now();
    abrir($.hall, $.hall); sfx('tink');
    const w = $.hItem.clientWidth; if (w) hall.R.setSize(w, w, false);
    const loop = ms => { hall.raf = requestAnimationFrame(loop); const s = ms / 1000; hall.pivot.rotation.y = s * 0.9; hall.pivot.position.y = Math.sin(s * 1.7) * 0.06; hall.R.render(hall.S, hall.C); };
    cancelAnimationFrame(hall.raf); hall.raf = requestAnimationFrame(loop);
  }
  function guardarHallazgo(relock) {
    if (dialogo !== $.hall || $.hall.classList.contains('out') || performance.now() - hall.t0 < 350) return;
    sfx('flip'); $.hall.classList.add('out');
    const id = hall.id; setTimeout(() => { pintarEncargos(id); pintarPistas(id); }, reducido ? 200 : 420);
    setTimeout(() => { cancelAnimationFrame(hall.raf); cerrar(relock); $.hall.classList.remove('out'); if (trasHallazgo) { mensaje(trasHallazgo, 4200); trasHallazgo = ''; } if (despuesHallazgo) { const fn = despuesHallazgo; despuesHallazgo = null; fn(); } revisarLogros(); }, reducido ? 320 : 650);
  }
  $.hall.addEventListener('click', () => guardarHallazgo(true));
  function entregar(t) {
    const e = t.enc; lab.entregar(e.id); cache.encargos[e.id] = 'entregado'; guardar(); pintarEncargos(); revisarLogros();
    const todos = lab.encargos.every(x => cache.encargos[x.id] === 'entregado');
    mensaje(e.gracias, 3200);
    if (todos) { lab.iniciarFinal(e.gato); lab.activarCalabaza(); }   // el gato espera ~3 s y luego guía a la tumba (evento "sigueme")
  }
  // Acariciar: ronronea, se calma un rato y deja una pista (o, si ya recibió lo suyo, la frase de la entrega)
  function acariciar(t) { lab.acariciar(t.gato); const e = t.enc; if (e) mensaje(e.estado === 'entregado' ? (e.despues || e.gracias) : e.caricia, 3800); }
  pintarEncargos();

  // ---------- Pistas del misterio: fotografía en 4 pedazos y caja de música ----------
  const fotoD = (json.pistas && json.pistas.foto) || {};
  let slotCaja = null;
  function pintarPistas(nuevo) {
    const ps = lab.pistas, n = ps.piezas.filter(p => cache.pistas[p.id]).length, tot = ps.piezas.length;
    $.invFoto.hidden = !n; $.invFoto.classList.toggle('completa', n === tot && tot > 0);
    if (n) { ps.componerFoto($.invFotoCv); $.invFotoN.textContent = `${n}`; $.invFotoN.hidden = n === tot; try { const mm = JSON.parse(localStorage.getItem('lab.mini')) || {}; mm.foto = $.invFotoCv.toDataURL('image/png'); localStorage.setItem('lab.mini', JSON.stringify(mm)); } catch (_) {} }   // [Kura] solo el número; la foto también va al Mausoleo
    $.invFoto.setAttribute('aria-label', n === tot ? 'Fotografía completa. Toca para verla.' : `Fotografía: ${n} de ${tot} pedazos.`);
    if (nuevo && /^foto/.test(nuevo)) { $.invFoto.classList.remove('nuevo'); void $.invFoto.offsetWidth; $.invFoto.classList.add('nuevo'); }
    const c = ps.caja; if (!c) return;
    if (!slotCaja) { slotCaja = document.createElement('div'); slotCaja.className = 'lab-slot'; slotCaja.setAttribute('role', 'listitem'); const im = document.createElement('img'); im.alt = ''; slotCaja.appendChild(im); $.invL.appendChild(slotCaja); }
    const lleva = cache.pistas.caja === 'llevas', im = slotCaja.firstChild; slotCaja.dataset.estado = lleva ? 'llevas' : 'vacio';
    if (lleva && !im.hasAttribute('src')) im.src = miniatura('caja');
    slotCaja.setAttribute('aria-label', lleva ? `${c.corto || 'caja de música'}, la llevas` : 'Espacio vacío');
    if (nuevo === 'caja') { slotCaja.classList.remove('nuevo'); void slotCaja.offsetWidth; slotCaja.classList.add('nuevo'); }
  }
  function recogerPieza(t) {
    lab.recogerPista(t.id); cache.pistas[t.id] = true; guardar();
    const ps = lab.pistas.piezas, n = ps.filter(p => cache.pistas[p.id]).length;
    if (n === ps.length) { pintarPistas(t.id); sfx('tink'); verFoto(true); }
    else verHallazgo({ id: t.id, objeto: fotoD.titulo || 'Pedazo de fotografía', para: `${n} de ${ps.length}`, hallazgo: `${fotoD.titulo || 'Pedazo de fotografía'}: ${n} de ${ps.length}.` });
  }
  function recogerCaja(t) {
    lab.recogerPista('caja'); cache.pistas.caja = 'llevas'; guardar(); pintarPistas();
    verHallazgo({ id: 'caja', objeto: t.objeto, para: t.para, hallazgo: t.hallazgo });
  }
  // La foto se arma: los 4 pedazos llegan desde fuera y encajan; luego aparece la pregunta
  let fotoT0 = 0;
  function verFoto(armar) {
    const M = $.fotoMarco; M.innerHTML = '';
    lab.pistas.piezas.forEach(pz => {
      const c = document.createElement('canvas'); c.width = pz.cv.width; c.height = pz.cv.height; c.getContext('2d').drawImage(pz.cv, 0, 0);
      const { PW, PH, PAD } = lab.pistas.medidas;
      c.style.left = ((pz.q % 2) * PW - PAD) / (PW * 2) * 100 + '%'; c.style.top = ((pz.q >> 1) * PH - PAD) / (PH * 2) * 100 + '%';
      c.style.width = (PW + PAD * 2) / (PW * 2) * 100 + '%'; c.style.height = (PH + PAD * 2) / (PH * 2) * 100 + '%';
      if (armar && !reducido) { const sx = pz.q % 2 ? 1 : -1, sy = pz.q >> 1 ? 1 : -1; c.style.transform = `translate(${sx * (40 + Math.random() * 25)}%,${sy * (35 + Math.random() * 25)}%) rotate(${(Math.random() - .5) * 30}deg)`; c.style.opacity = '0'; c.style.transitionDelay = (pz.q * 0.12) + 's'; }
      M.appendChild(c);
    });
    $.fotoT.textContent = fotoD.texto || ''; $.foto.classList.toggle('armando', !!armar); $.foto.classList.remove('out');
    $.foto.setAttribute('aria-label', `Fotografía completa. ${fotoD.texto || ''}`);
    fotoT0 = performance.now(); abrir($.foto, $.foto);
    requestAnimationFrame(() => requestAnimationFrame(() => { [...M.children].forEach(c => { c.style.transform = ''; c.style.opacity = ''; }); $.foto.classList.remove('armando'); }));
  }
  function cerrarFoto(relock) {
    if (dialogo !== $.foto || $.foto.classList.contains('out') || performance.now() - fotoT0 < 500) return;
    $.foto.classList.add('out'); setTimeout(() => { cerrar(relock); $.foto.classList.remove('out'); revisarLogros(); /* [Kura] */ }, reducido ? 250 : 550);
  }
  $.foto.addEventListener('click', () => cerrarFoto(true));
  $.invFoto.addEventListener('click', () => { if (!dialogo && $.invFoto.classList.contains('completa')) verFoto(false); });
  pintarPistas();

  // ---------- Cartas de tarot: se recogen aquí (solo en este dispositivo) y se colocan en la mesa del Mausoleo ----------
  let trasHallazgo = '', despuesHallazgo = null;
  function pintarCartas() {
    const l = lab.cartas, n = l.filter(c => cache.cartas[c.id]).length;
    // [Kura] en el inventario: aparece con la primera carta, dorso + contador, y 'estampa' al sumar una
    const antes = +($.cartasP.dataset.n || 0);
    $.cartasP.hidden = !n; $.cartasN.textContent = `${n}`; $.cartasP.setAttribute('aria-label', `Cartas: ${n} de ${l.length}.`);
    if (n && !$.cartasP.dataset.pintado) { const d = dorsoCarta(), g = $.cartasCv.getContext('2d'); g.drawImage(d, 0, 0, $.cartasCv.width, $.cartasCv.height); $.cartasP.dataset.pintado = '1'; }
    if (n > antes && antes > 0) { $.cartasP.classList.remove('nuevo'); void $.cartasP.offsetWidth; $.cartasP.classList.add('nuevo'); }
    $.cartasP.dataset.n = n;
  }
  function recogerCarta(t) {
    lab.recogerCarta(t.id); cache.cartas[t.id] = true; guardar(); pintarCartas();
    const l = lab.cartas, n = l.filter(c => cache.cartas[c.id]).length;
    if (n === l.length) trasHallazgo = 'Tienes todas las cartas. Llévalas a la mesa del Mausoleo.';
    verHallazgo({ id: t.id, objeto: t.nombre, para: t.sentido, hallazgo: `Encontraste ${t.nombre}. ${t.sentido}. Llevas ${n} de ${l.length}.` });
  }
  pintarCartas();
  // Calabaza: aparece encendida en algún rincón cuando los tres gatos ya recibieron lo suyo
  function recogerCalabaza() {
    lab.recogerCalabaza(); cache.calabaza = true; guardar();
    despuesHallazgo = () => { revisarLogros(); /* [Kura] */ if (lab.bailarCalabaza()) setTimeout(() => mensaje('¿Están… bailando?', 2800), 1800); };
    verHallazgo({ id: 'calabaza', objeto: 'La calabaza', para: 'Alguien la dejó encendida.', hallazgo: 'Encontraste la calabaza. Alguien la dejó encendida.' });
  }

  // ---------- Sellos: el servidor manda; la caché pinta mientras tanto ----------
  const api = crearApi({ base: apiBase || q.get('api') || null, red: q.get('red') || red, cache, guardar, lapidas: lab.mapa.lapidas.map(l => l.id) });
  let sellos = {}, enLinea = null;
  function aplicarProgreso() {
    sellos = { ...((cache.progreso && cache.progreso.sellos) || {}) };
    (cache.pendientes || []).forEach(p => { if (p.resultado.gano && !sellos[p.lapida]) sellos[p.lapida] = { ganado: p.t, entregado: null, pendiente: true }; });
    lab.mapa.lapidas.forEach(l => lab.setSellada(l.id, !!sellos[l.id]));
    pintarObjetivo(lab.estado().objetivo, true);
    pintarSellos(); revisarLogros();
  }
  // Sellos en el inventario: el sello de cera con un contador de los que llevas (ganados y aún no entregados)
  let sellosPrev = null;
  function pintarSellos() {
    const total = lab.mapa.lapidas.length, ids = Object.keys(sellos).filter(id => lab.mapa.lapidas.some(l => l.id === id));
    const porEntregar = ids.filter(id => !sellos[id].entregado).length, pend = (cache.pendientes || []).length;
    $.invSello.hidden = !porEntregar; $.invSelloN.textContent = porEntregar; $.invSync.hidden = !pend;
    $.invSello.setAttribute('aria-label', `Sellos: ${ids.length} de ${total}. ${porEntregar} por entregar.${pend ? ' Sincronizando.' : ''}`);
    if (sellosPrev !== null && porEntregar > sellosPrev) { $.invSello.classList.remove('nuevo'); void $.invSello.offsetWidth; $.invSello.classList.add('nuevo'); }
    sellosPrev = porEntregar;
  }
  let sincronizando = false;
  async function sincronizar() {
    if (sincronizando) return; sincronizando = true;
    try {
      await api.sincronizar();
      const p = await api.progreso(); enLinea = true;
      if (cache.apodo && p.apodo !== cache.apodo) await api.setApodo(cache.apodo);
    } catch (e) { enLinea = false; }
    finally { sincronizando = false; aplicarProgreso(); }
  }
  aplicarProgreso(); sincronizar();
  addEventListener('online', sincronizar);
  const syncT = setInterval(() => { if ((cache.pendientes || []).length) sincronizar(); }, 15000);

  // ---------- Partida: token del servidor → minijuego → resultado ----------
  let partida = null;
  async function preparar(l, practica) {
    const def = await cargarMinijuego(l.juego);
    if (!def) throw Object.assign(new Error('sin_juego'), { sinJuego: true });
    const intento = practica ? { token: null, semilla: (Math.random() * 4294967296) >>> 0 } : await api.iniciar(l.id);
    return { def, intento };
  }
  function errorIntento(e, l, notaEl) {
    if (e.status === 409) { sellos[l.id] = sellos[l.id] || { ganado: null, entregado: null }; lab.setSellada(l.id, true); pintarSellos(); sincronizar(); notaEl.textContent = 'Ya tienes este sello.'; }
    else if (e.sinJuego) notaEl.textContent = 'Este minijuego todavía no existe.';
    else notaEl.textContent = 'No hay conexión con el cementerio. Intenta otra vez.';
  }
  async function jugar(l) {
    const btn = $.pJugar, practica = !!sellos[l.id], txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Preparando…';
    try { const { def, intento } = await preparar(l, practica); abrirJuego(l, def, intento, practica); }
    catch (e) { errorIntento(e, l, $.pNota); if (e.status === 409) abrirPanel(l); }
    finally { btn.disabled = !disponible(l.juego); btn.textContent = txt; }
  }
  function abrirJuego(l, def, intento, practica) {
    $.panel.hidden = true;
    dialogo = $.juego; $.juego.hidden = false; $.fin.hidden = true; $.jMarco.inert = false;
    $.jLapida.textContent = l.nombre; $.jT.textContent = def.title;
    $.jRoot.innerHTML = '';
    const game = def.create($.jRoot, { params: l.params || {}, seed: intento.semilla, sfx, reducedMotion: reducido, epitafio: l.epitafio || '', lapida: { id: l.id, nombre: l.nombre } });
    partida = { l, def, game, token: intento.token, practica };
    game.onWin = r => terminar(true, r || {});
    game.onLose = r => terminar(false, r || {});
    game.start(intento.token);
  }
  function salirJuego() { if (partida) { partida.game.destroy(); partida = null; } cerrar(true); }
  const finEstado = t => { $.fEstado.textContent = t; };
  async function terminar(gano, r) {
    if (!partida || partida.fin) return;
    partida.fin = true;
    const { l, token, practica } = partida, s = $.fSello;
    $.fin.hidden = false; $.jMarco.inert = true; $.fApodo.hidden = true; $.fOtra.hidden = gano; finEstado('');
    s.hidden = !gano;
    if (!gano) {
      sfx('toll');
      $.fT.textContent = r.razon === 'tiempo' ? 'Se apagó la vela' : 'No esta vez';
      $.fP.textContent = 'Puedes intentarlo otra vez.';
      if (!practica) api.resultado(token, l.id, { gano: false, ms: r.ms || null }).catch(() => {});
      $.fOtra.focus(); return;
    }
    s.textContent = '★'; s.classList.remove('estampa'); void s.offsetWidth; s.classList.add('estampa');
    setTimeout(() => sfx('thud'), reducido ? 0 : 200);
    $.fT.textContent = practica ? 'Ganaste' : 'Sello obtenido';
    $.fP.textContent = practica ? `Ya tenías el sello de ${l.nombre}.` : `El sello de ${l.nombre} es tuyo.`;
    $.fVolver.focus();
    if (practica) return;
    sellos[l.id] = { ganado: new Date().toISOString(), entregado: null, pendiente: true };
    lab.setSellada(l.id, true); pintarSellos();
    finEstado('Guardando…');
    try { await api.resultado(token, l.id, { gano: true, ms: r.ms }); finEstado('Guardado.'); enLinea = true; }
    catch (e) { finEstado(e.status ? 'El servidor no aceptó el resultado.' : 'Sin conexión. Se guardará cuando vuelva.'); }
    aplicarProgreso();
    const n = Object.keys(sellos).filter(id => lab.mapa.lapidas.some(x => x.id === id)).length, total = lab.mapa.lapidas.length;   // solo los de las lápidas (no los "extra:" del Mausoleo)
    if (n === total) $.fP.textContent += ' Tienes todos los sellos: llévalos al Mausoleo.';
    if (!cache.apodo && partida && partida.l === l) { $.fApodo.hidden = false; $.apodoIn.focus(); }
  }
  $.jSalir.addEventListener('click', salirJuego);
  $.fVolver.addEventListener('click', salirJuego);
  $.fOtra.addEventListener('click', async () => {
    const { l, practica } = partida, btn = $.fOtra;
    btn.disabled = true; btn.textContent = 'Preparando…';
    try { const { def, intento } = await preparar(l, practica); partida.game.destroy(); abrirJuego(l, def, intento, practica); }
    catch (e) { errorIntento(e, l, $.fEstado); }
    finally { btn.disabled = false; btn.textContent = 'Reintentar'; }
  });
  $.fApodo.addEventListener('submit', e => {
    e.preventDefault();
    const v = $.apodoIn.value.trim(); if (!v) return;
    cache.apodo = v; guardar(); api.setApodo(v).catch(() => {});
    $.fApodo.hidden = true; finEstado(`Firmado como ${v}.`); $.fVolver.focus();
  });
  $.apodoNo.addEventListener('click', () => { $.fApodo.hidden = true; $.fVolver.focus(); });

  // ---------- Pausa y ajustes ----------
  function syncLinterna() {
    const s = lab.ajustarLinterna();
    $.lt.value = s.grados; $.ltO.textContent = s.grados + '°';
    $.li.value = s.pct; $.liO.textContent = s.pct + '%';
    $.ll.value = s.alcance; $.llO.textContent = s.alcance + ' m';
    $.lp.value = s.borde; $.lpO.textContent = s.borde + '%';
    if ($.linTam) { $.linTam.value = s.grados; $.linTamO.textContent = s.grados + '°'; $.linInt.value = s.pct; $.linIntO.textContent = s.pct + '%'; }
  }
  function setLinterna(v) { cache.linterna = Object.assign(cache.linterna || {}, v, { v: 2 }); guardar(); lab.ajustarLinterna(v); syncLinterna(); }
  [['lt', 'grados'], ['li', 'pct'], ['ll', 'alcance'], ['lp', 'borde']].forEach(([k, p]) => $[k].addEventListener('input', () => setLinterna({ [p]: +$[k].value })));
  if (cache.linterna && cache.linterna.v !== 2) { delete cache.linterna; guardar(); }   // defaults nuevos: haz 20°, intensidad 70 %
  /* [Kura] los ajustes de linterna ya no están en el menú: no se aplican los guardados */
  function syncPausa() {
    syncLinterna();
    $$('[data-p-giro]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pGiro === ajustes.giro));
    $$('[data-p-paso]').forEach(b => { b.setAttribute('aria-pressed', +b.dataset.pPaso === ajustes.pasoGrados); b.disabled = ajustes.giro !== 'pasos'; });
    $.sens.value = ajustes.sensibilidad; $.sensO.textContent = (+ajustes.sensibilidad).toFixed(1); $.inv.checked = !!ajustes.invertirY;
  }
  function setAjuste(a) { lab.setAjustes(a); guardar(); syncPausa(); }
  function abrirPausa() { syncPausa(); abrir($.pausa, $.seguir); }
  $$('[data-p-giro]').forEach(b => b.addEventListener('click', () => setAjuste({ giro: b.dataset.pGiro })));
  $$('[data-p-paso]').forEach(b => b.addEventListener('click', () => setAjuste({ pasoGrados: +b.dataset.pPaso })));
  $.sens.addEventListener('input', e => setAjuste({ sensibilidad: +e.target.value }));
  $.inv.addEventListener('change', e => setAjuste({ invertirY: e.target.checked }));
  $.seguir.addEventListener('click', () => cerrar(true));
  $.btnPausa.addEventListener('click', () => { if (!dialogo && $.entrada.hidden) abrirPausa(); });

  // ---------- Mapa, ruta ----------
  let completo = false;
  function setRuta(v) {
    lab.setRuta(v); [$.btnRuta, $.mapaRuta].forEach(b => b.setAttribute('aria-pressed', v));
    if (v) mensaje('Sigue los pétalos hasta el Mausoleo.');
  }
  $.btnRuta.addEventListener('click', () => setRuta(!lab.ruta));
  $.mapaRuta.addEventListener('click', () => { setRuta(!lab.ruta); pintarMapaGrande(); });
  function pintarMapaGrande() {
    lab.dibujarMinimapa($.mapaCv.getContext('2d'), 1024, { completo });
    const s = lab.estado(), vistas = lab.mapa.lapidas.filter(l => l.sellada).length;
    $.mapaDesc.textContent = `Exploraste el ${Math.round(s.explorado * 100)} % del laberinto. ${vistas} de ${lab.mapa.lapidas.length} lápidas resueltas.${lab.ruta ? ' La ruta al Mausoleo está marcada.' : ''}`;
  }
  function abrirMapa() { if (dialogo || !$.entrada.hidden) return; pintarMapaGrande(); abrir($.mapa, $.mapaCerrar); }
  $.mini.addEventListener('click', abrirMapa);
  $.mapaCerrar.addEventListener('click', () => cerrar(true));

  // ---------- Entrada ----------
  function entrar() { if ($.entrada.hidden) return; $.entrada.hidden = true; sfx.desbloquear(); sfx.linterna(); lab.pausar(false); $.stage.focus({ preventScroll: true }); lab.bloquear(); }
  $.entrada.addEventListener('click', entrar);
  $.entrada.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrar(); } });

  // ---------- Dev ----------
  const conDev = dev || q.get('dev') === '1';
  $.badge.textContent = temaF === 'cementerio' ? 'FASE 4c · CEMENTERIO' : 'FASE 4b · MUROS';
  $.dev.hidden = !conDev;
  if (conDev) {
    $.devT.addEventListener('click', () => { const on = $.dev.classList.toggle('abierta'); $.devT.setAttribute('aria-expanded', on); });
    if (q.get('dev') === 'abierta') { $.dev.classList.add('abierta'); $.devT.setAttribute('aria-expanded', 'true'); }
    const redBtns = $$('[data-red]');
    const setRed = v => { api.red = v; redBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.red === v)); if (v !== 'falla') sincronizar(); };
    redBtns.forEach(b => b.addEventListener('click', () => setRed(b.dataset.red))); setRed(api.red);
    const luzBtns = $$('[data-luz]');
    const setLuzB = m => { lab.setLuz(m); luzBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.luz === m)); };
    luzBtns.forEach(b => b.addEventListener('click', () => setLuzB(b.dataset.luz))); setLuzB(q.get('luz') || luz);
    let irI = 0;
    $.devIr.addEventListener('click', () => { const l = lab.mapa.lapidas[irI++ % lab.mapa.lapidas.length]; lab.irA(l); mensaje(`Frente a ${l.nombre} · ${l.juego}`); });
    $.devPuerta.addEventListener('click', () => { if (lab.mapa.puerta) lab.irA(lab.mapa.puerta, 1); });
    $.devGatos.addEventListener('click', () => { lab.forzar('gatos'); mensaje('Vaquita, Bonnie y Cuchito frente a ti.'); });
    $.devAparicion.addEventListener('click', () => lab.forzar('aparicion'));
    $.devOjos.addEventListener('click', () => lab.forzar('ojos'));
    let objI = 0;
    $.devObjeto.addEventListener('click', () => {
      const l = lab.encargos; if (!l.length) return; const e = l[objI++ % l.length];
      lab.ponerEn(e.celda[0] + e.f[0], e.celda[1] + e.f[1], Math.atan2(e.f[0], e.f[1]), -0.4); mensaje(`Cerca de: ${e.objeto} · ${cache.encargos[e.id] || 'escondido'}`);
    });
    $.devTumba.addEventListener('click', () => { if (lab.mapa.tumba) lab.irA(lab.mapa.tumba, 1.4); });
    $.devRayo.addEventListener('click', () => { lab.rayo(); const r = $.rayo; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); });
    $.devFinal.addEventListener('click', () => { const ids = lab.forzarFinal(); ids.forEach(id => { cache.encargos[id] = 'entregado'; }); guardar(); pintarEncargos(); });
    let piezaI = 0;
    $.devPieza.addEventListener('click', () => { const l = lab.pistas.piezas; if (!l.length) return; const p = l[piezaI++ % l.length]; lab.mirarA(p.x, p.z); mensaje(`Pedazo ${p.q + 1} · ${p.estado}`); });
    $.devCaja.addEventListener('click', () => { const c = lab.pistas.caja; if (c) { lab.mirarA(c.obj.position.x, c.obj.position.z); mensaje(`Caja · ${c.estado}`); } });
    $.devFotoT.addEventListener('click', () => { lab.pistas.piezas.forEach(p => { if (p.estado === 'escondido') lab.recogerPista(p.id); cache.pistas[p.id] = true; }); guardar(); pintarPistas('foto1'); verFoto(true); });
    $.devPistas.addEventListener('click', () => { lab.resetPistas(); cache.pistas = {}; guardar(); if (slotCaja) slotCaja.firstChild.removeAttribute('src'); pintarPistas(); mensaje('Pistas borradas.'); });
    let cuervoI = 0;
    $.devCuervo.addEventListener('click', () => {
      const l = lab.secretos.cuervos; if (!l.length) { mensaje('No hay árboles para los cuervos.'); return; }
      const v = l[cuervoI++ % l.length], { C, solido } = lab.mapa, cx = Math.floor(v.x / C), cy = Math.floor(v.z / C); let b = null;
      for (let r = 1; r <= 4 && !b; r++) for (let dy = -r; dy <= r && !b; dy++) for (let dx = -r; dx <= r && !b; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && !solido(cx + dx, cy + dy)) b = [cx + dx, cy + dy];
      if (!b) return; const px = (b[0] + .5) * C, pz = (b[1] + .5) * C;
      lab.ponerEn(b[0], b[1], Math.atan2(px - v.x, pz - v.z), Math.min(0.9, Math.atan2(v.y - 1.6, Math.hypot(px - v.x, pz - v.z)))); mensaje(`${v.id} · ${v.estado}`);
    });
    $.devCalabaza.addEventListener('click', () => { const c = lab.secretos.calabaza; if (!c) return; if (!c.activa) { lab.activarCalabaza(); mensaje('Calabaza activada (como si los gatos ya tuvieran lo suyo).'); } lab.mirarA(c.x, c.z); });
    $.devSecretos.addEventListener('click', () => { lab.resetSecretos(); cache.cuervos = {}; delete cache.calabaza; guardar(); mensaje('Cuervos y calabaza borrados.'); });
    $.devGatoB.addEventListener('click', () => { const g = lab.secretos.gatoBlanco; if (!g) { mensaje('No hay árbol para el gato blanco.'); return; } const { C } = lab.mapa, cx = Math.floor(g.fp.x / C), cy = Math.floor(g.fp.z / C); lab.ponerEn(cx, cy, Math.atan2((cx + .5) * C - g.x, (cy + .5) * C - g.z), 0.25); });
    $.devBaile.addEventListener('click', () => { const c = lab.secretos.calabaza; if (!c) return; lab.mirarA(c.x, c.z, 2.2); setTimeout(() => lab.bailarCalabaza(), 100); });
    let cartaI = 0;
    $.devCarta.addEventListener('click', () => { const l = lab.cartas; if (!l.length) return; const c = l[cartaI++ % l.length]; lab.mirarA(c.x, c.z); mensaje(`${c.nombre} · ${c.lugar} · ${c.estado}`); });
    $.devCartas.addEventListener('click', () => { lab.resetCartas(); cache.cartas = {}; guardar(); pintarCartas(); mensaje('Cartas borradas.'); });
    $.devEncargos.addEventListener('click', () => { lab.resetEncargos(); cache.encargos = {}; guardar(); pintarEncargos(); mensaje('Encargos borrados.'); });
    $.devDeco.addEventListener('click', () => { const on = $.devDeco.getAttribute('aria-pressed') !== 'true'; lab.setDeco(on); $.devDeco.setAttribute('aria-pressed', on); });
    $.linTam.addEventListener('input', () => setLinterna({ grados: +$.linTam.value }));
    $.linInt.addEventListener('input', () => setLinterna({ pct: +$.linInt.value }));
    $.devCompleto.addEventListener('click', () => { completo = !completo; $.devCompleto.setAttribute('aria-pressed', completo); });
    $.devInfo.addEventListener('click', () => { $.info.hidden = !$.info.hidden; $.devInfo.setAttribute('aria-pressed', !$.info.hidden); });
    $.devOlvidar.addEventListener('click', () => { lab.olvidar(); mensaje('Mapa olvidado.'); });
    $.devBorrar.addEventListener('click', () => { api.borrarMock(); cache.progreso = null; cache.pendientes = []; cache.apodo = null; guardar(); aplicarProgreso(); sincronizar(); mensaje('Sellos borrados en el mock y en la caché.'); });
    $.devReset.addEventListener('click', () => { lab.reiniciar(); cache.pos = null; guardar(); mensaje('Posición reiniciada.'); });
  } else lab.setLuz(q.get('luz') || luz);
  syncPausa();

  // ---------- Bucle ----------
  let last = performance.now(), infoT = 0, saveT = 0, raf = 0, vivo = true;
  const miniCtx = $.miniCv.getContext('2d');
  function loop(t) {
    if (!vivo) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    lab.frame(dt);
    if (!dialogo) lab.dibujarMinimapa(miniCtx, $.miniCv.width, { completo });
    if (!$.info.hidden && (infoT += dt) > 0.25) {
      infoT = 0; const s = lab.estado();
      $.info.textContent = `fps ${s.fps}\ncelda ${s.celda.join(',')} · rumbo ${s.rumbo}°\nexplorado ${Math.round(s.explorado * 100)} %\ngiro ${ajustes.giro}${ajustes.giro === 'pasos' ? ' ' + ajustes.pasoGrados + '°' : ''}\nobjetivo ${s.objetivo ? (s.objetivo.id || s.objetivo.tipo) : '—'}\n${api.modo} · red ${api.red} · ${enLinea === null ? 'conectando' : enLinea ? 'en línea' : 'sin conexión'}\npendientes ${(cache.pendientes || []).length} · apodo ${cache.apodo || '—'}`;
    }
    if ((saveT += dt) > 1) { saveT = 0; const s = lab.estado(); cache.pos = { x: +s.x.toFixed(2), z: +s.z.toFixed(2), yaw: +s.yaw.toFixed(3), v: json.version }; guardar(); }
  }
  raf = requestAnimationFrame(loop);
  const onHide = () => { const s = lab.estado(); cache.pos = { x: s.x, z: s.z, yaw: s.yaw, v: json.version }; guardar(); };
  addEventListener('pagehide', onHide);

  // Arranque: con entrada (página propia) o directo (viene de la reja, ya hubo gesto)
  requestAnimationFrame(() => requestAnimationFrame(() => $.velo.classList.add('fuera')));
  setTimeout(() => $.velo.classList.add('fuera'), 120);   // por si la pestaña arranca oculta y no hay rAF
  if (entrada) { $.entrada.hidden = false; $.entrada.focus(); }
  else { lab.pausar(false); $.stage.focus({ preventScroll: true }); lab.bloquear(); }

  return {
    lab, api, cache,
    // Ajustes en vivo de cómo se obtienen los objetos de los gatos (panel de Tweaks)
    tweaks(c = {}) {
      if (c.hallazgo) TW.hallazgo = c.hallazgo;
      if (c.inventario != null) { TW.inventario = !!c.inventario; $.invBar.hidden = !TW.inventario; }
      if (c.minimapa != null) lab.setMarcadores(c.minimapa);
      const d = {}; ['aros', 'destello', 'alcance', 'vienen', 'miau'].forEach(k => { if (c[k] != null) d[k] = c[k]; });
      if (Object.keys(d).length) lab.ajustarEncargos(d);
      const dp = {}; ['aros', 'destello', 'alcance'].forEach(k => { if (c[k] != null) dp[k] = c[k]; }); if (Object.keys(dp).length) lab.ajustarPistas(dp);
    },
    desmontar() {
      vivo = false; cancelAnimationFrame(raf); clearInterval(syncT);
      removeEventListener('keydown', onKey); removeEventListener('pointerdown', onInput, true); removeEventListener('online', sincronizar); removeEventListener('pagehide', onHide);
      if (partida) partida.game.destroy();
      if (hall) { cancelAnimationFrame(hall.raf); hall.ro.disconnect(); hall.R.dispose(); }
      lab.dispose(); if (propio) renderer.dispose(); ui.remove();
    },
  };
}
