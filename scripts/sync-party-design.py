#!/usr/bin/env python3
"""
Copy the /party labyrinth + Mausoleum from the Claude Design project into public/ and re-apply Kura's
local patches. The design keeps iterating; this is how an update lands without hand-editing.

  python3 scripts/sync-party-design.py <proto-dir>

<proto-dir> is the design project's `proto/` folder as exported (it must contain `laberinto/`,
`mausoleo/` and "Fase 3e - Mausoleo v3.html"). Every patch ASSERTS its anchor: if the design moved
something, the script stops and says which patch no longer applies — fix the anchor, never skip it.
What each patch is for: .claude/knowledge/state/frontend.md (search "[Kura]").
"""
import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LAB = os.path.join(ROOT, "public/party/laberinto")
MAU = os.path.join(ROOT, "public/party/mausoleo")
MAUSOLEO_PAGE = "Fase 3e - Mausoleo v3.html"
OPENS = "2026-10-03T00:00:00"  # keep in sync with PARTY_LANDING.opensISO (src/modules/party/event.ts)


def patch(text, pairs, where):
    for old, new in pairs:
        n = text.count(old)
        if n != 1:
            sys.exit(f"[sync] {where}: the anchor appears {n} times (expected 1):\n  {old[:160]!r}")
        text = text.replace(old, new)
    return text


def main(src):
    src_lab = os.path.join(src, "laberinto")
    if not os.path.isdir(src_lab):
        sys.exit(f"[sync] {src_lab} does not exist")

    # ---------- Labyrinth: every module verbatim, three.js from our vendor copy ----------
    keep = {"foto.jpg"}  # the founder's photo: not in the design project
    for dirpath, _, files in os.walk(LAB):
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), LAB)
            if rel not in keep:
                os.remove(os.path.join(dirpath, f))
    for dirpath, _, files in os.walk(src_lab):
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), src_lab)
            out = os.path.join(LAB, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            data = open(os.path.join(dirpath, f), encoding="utf-8").read()
            if f.endswith(".js"):
                data = data.replace("from 'three'", "from '../vendor/three.module.min.js'")
            open(out, "w", encoding="utf-8").write(data)

    def edit(rel, pairs):
        p = os.path.join(LAB, rel)
        text = patch(open(p, encoding="utf-8").read(), pairs, rel)  # read BEFORE opening for write (that truncates)
        open(p, "w", encoding="utf-8").write(text)

    # Tombstones: no cross (iOS drew ✝ as an emoji); the wax seal goes up where it was.
    edit("texturas.js", [
        ("  grabar('✝', 62, '700 30px Cinzel, Georgia, serif');\n",
         """  // [Kura, founder 2026-10-02] Sin la cruz (en iOS el canvas la pintaba como emoji). En su lugar va el sello de
  // cera (motor.js lo coloca aquí arriba); debajo queda grabado su hueco: dos aros, visibles al romper el sello.
  const SY = 66;
  [[40, 2.5], [29, 1.5]].forEach(([r, w]) => {
    g.lineWidth = w;
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(W / 2 + 1, SY + 1.5, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(28,27,30,.6)'; g.beginPath(); g.arc(W / 2, SY, r, 0, Math.PI * 2); g.stroke();
  });
"""),
        ("  const y0 = 140 - (lineas.length - 1) * 17;",
         "  const y0 = 158 - (lineas.length - 1) * 17;   // [Kura] 140 → 158: el nombre baja para dejarle sitio al sello"),
        ("  const yF = y0 + lineas.length * 34 + 18; let fs = 19;", "  const yF = y0 + lineas.length * 34 + 12; let fs = 19;"),
        ("  g.fillStyle = 'rgba(40,38,36,.35)'; g.fillRect(W / 2 - 34, H - 64, 68, 2);",
         "  g.fillStyle = 'rgba(40,38,36,.35)'; g.fillRect(W / 2 - 34, H - 44, 68, 2);   // [Kura] remate más abajo: ya no hay sello ahí"),
    ])
    # Real CC0 recordings (public/party/sfx, sources in its LICENSE.txt) instead of the design's synthesis, which
    # stays as the fallback while they load. Kept synthesized: the Simon's notes (exact pitches), the music box's
    # original phrase and the cumbia (founder asked for a copyrighted song — declined; see state/frontend.md).
    edit("sfx.js", [
        ("  return sfx;\n}", """  // [Kura, founder 2026-10-02] Grabaciones CC0 de public/party/sfx (fuentes en su LICENSE.txt) en vez de la
  // síntesis, que queda de respaldo mientras cargan o si una falla. Siguen sintetizados: las notas del Simon,
  // la caja de música (frase original) y la cumbia.
  const GRAB = { tink: 3, flip: 3, thud: 3, toll: 1, bell: 1, click: 1, chain: 8, scream: 1, crow: 2, meow: 3, purr: 1, thunder: 1, whisper: 1, match: 1, baile: 1 };
  const crudo = {}, listo = {};
  Object.entries(GRAB).forEach(([n, k]) => { crudo[n] = Array.from({ length: k }, (_, i) => fetch(`/party/sfx/${n}-${i}.m4a`).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)); });
  let decodificado = null;
  function decodificar(c) {
    if (decodificado === c) return; decodificado = c;
    Object.entries(crudo).forEach(([n, ps]) => ps.forEach(p => p.then(b => b && c.decodeAudioData(b.slice(0))).then(buf => { if (buf) (listo[n] = listo[n] || []).push(buf); }).catch(() => {})));
  }
  function grabacion(n, vol = 1, { pan = 0, rate = 1, retraso = 0 } = {}) {
    const c = ctx(); if (!c) return false; decodificar(c);
    const l = listo[n]; if (!l || !l.length) return false;
    try {
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = l[Math.floor(Math.random() * l.length)];
      s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.06); g.gain.value = vol;
      s.connect(g); salida(c, g, pan); s.start(c.currentTime + 0.005 + retraso); return true;
    } catch (_) { return false; }
  }
  const base = sfx, MAPA = { tink: 0.6, flip: 0.8, thud: 0.8, toll: 0.9, bell: 0.85, click: 0.9 };
  const conGrab = (nombre, vol = 1) => { if (MAPA[nombre] && grabacion(nombre, MAPA[nombre] * vol)) return; base(nombre, vol); };
  Object.assign(conGrab, base);
  const sobre = (k, f) => { const o = base[k]; if (o) conGrab[k] = (...a) => (f(...a) ? undefined : o(...a)); };
  sobre('graznido', (vol = 1, pan = 0) => grabacion('crow', 0.8 * vol, { pan }));
  sobre('miau', (vol = 1, tono = 1, pan = 0) => grabacion('meow', 0.7 * vol, { pan, rate: tono }));
  sobre('ronroneo', (vol = 1, pan = 0) => vol <= 0.02 || grabacion('purr', 0.6 * vol, { pan }));
  sobre('susurro', (vol = 1, pan = 0) => vol <= 0.02 || grabacion('whisper', 0.5 * vol, { pan }));
  // Los eventos especiales bajan la música ambiental para hacerse oír (founder 2026-10-02): window.__audio.ducking
  // lo ponen la página del laberinto y la del Mausoleo (party-drone.ts → duckAmbience).
  const agachar = segs => { try { window.__audio && window.__audio.ducking && window.__audio.ducking(segs); } catch (_) {} };
  const conDuck = (k, segs) => { const o = conGrab[k] || base[k]; if (o) conGrab[k] = (...a) => { agachar(typeof segs === 'function' ? segs(...a) : segs); return o(...a); }; };
  sobre('susto', () => grabacion('scream', 1));
  sobre('trueno', () => grabacion('thunder', 1));
  sobre('cerillo', () => grabacion('match', 0.8));
  sobre('cadena', (k = 1) => grabacion('chain', Math.min(1, 0.55 + 0.25 * k)));
  sobre('linterna', (retraso = 0) => grabacion('click', 0.9, { retraso }));
  sobre('error', () => grabacion('thud', 0.8));
  // Baile de los gatos: si el founder puso su audio en public/party/sfx/baile-0.m4a, suena eso (los primeros
  // `dur` segundos, con fundido); si no, la cumbia sintetizada del diseño.
  let baileSrc = null;
  sobre('cumbia', (dur = 13) => {
    const c = ctx(); if (!c) return false; decodificar(c);
    const l = listo.baile; if (!l || !l.length) return false;
    const s = c.createBufferSource(), g = c.createGain(), t = c.currentTime + 0.01;
    s.buffer = l[0]; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.3);
    g.gain.setValueAtTime(0.9, t + Math.max(0.5, dur - 1)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(g).connect(c.destination); s.start(t); s.stop(t + dur + 0.05); baileSrc = { s, g }; return true;
  });
  conDuck('cumbia', (dur = 13) => dur + 0.5); conDuck('susto', 2.5); conDuck('trueno', 6); conDuck('cajita', 4);
  conGrab.cumbiaParar = () => {
    if (baileSrc) { const c = ctx(); try { baileSrc.g.gain.setTargetAtTime(0, c.currentTime, 0.08); baileSrc.s.stop(c.currentTime + 0.5); } catch (_) {} baileSrc = null; }
    if (base.cumbiaParar) base.cumbiaParar();
  };
  conGrab.desbloquear = (...a) => { base.desbloquear(...a); const c = ctx(); if (c) decodificar(c); };
  return conGrab;
}"""),
    ])
    # Tarot cards go in the left inventory (card back + small counter), not as a pill at the top (founder 2026-10-02).
    edit("app.js", [
        ("import { cargarLogros, crearLogros, crearAvisoLogros } from './logros.js';",
         "import { cargarLogros, crearLogros, crearAvisoLogros } from './logros.js';\nimport { dorsoCarta } from './cartas.js';   // [Kura] dorso de carta para el inventario"),
        ('    <div class="lab-pill lab-sellos" role="status" data-r="cartasP" hidden><span>Cartas <b data-r="cartasN">0/6</b></span></div>\n', ''),
        ('  <span class="lab-inv-sync" data-r="invSync" hidden>Sincronizando</span>',
         '  <div class="lab-inv-carta" role="status" data-r="cartasP" hidden><canvas width="92" height="144" data-r="cartasCv" aria-hidden="true"></canvas><b data-r="cartasN" aria-hidden="true">0</b></div><!-- [Kura] cartas en el inventario -->\n  <span class="lab-inv-sync" data-r="invSync" hidden>Sincronizando</span>'),
        ("    $.cartasP.hidden = !l.length; $.cartasN.textContent = `${n}/${l.length}`; $.cartasP.setAttribute('aria-label', `Cartas: ${n} de ${l.length}.`);",
         "    // [Kura] en el inventario: aparece con la primera carta, dorso + contador, y 'estampa' al sumar una\n"
         "    const antes = +($.cartasP.dataset.n || 0);\n"
         "    $.cartasP.hidden = !n; $.cartasN.textContent = `${n}`; $.cartasP.setAttribute('aria-label', `Cartas: ${n} de ${l.length}.`);\n"
         "    if (n && !$.cartasP.dataset.pintado) { const d = dorsoCarta(), g = $.cartasCv.getContext('2d'); g.drawImage(d, 0, 0, $.cartasCv.width, $.cartasCv.height); $.cartasP.dataset.pintado = '1'; }\n"
         "    if (n > antes && antes > 0) { $.cartasP.classList.remove('nuevo'); void $.cartasP.offsetWidth; $.cartasP.classList.add('nuevo'); }\n"
         "    $.cartasP.dataset.n = n;"),
        # Crow lines in the player's own voice (founder 2026-10-02).
        ("mensaje(n >= tot ? 'Ese era el último cuervo.' : `Un cuervo… ya van ${n} de ${tot}.`, 3200);",
         "mensaje(n >= tot ? 'Creo que esos son todos.' : (['Un cuervo. ¿Cuántos habrá? Puedo escucharlos cerca.', 'Al menos son 2.', 'Van 3.'][n - 1] || `Van ${n}.`), 3200) /* [Kura] textos del founder */;"),
        # White cat scare: the founder's jumpscare photo from the old landing fills the screen (founder 2026-10-02).
        ('<div class="lab-susto" data-r="susto" aria-hidden="true"></div>',
         '<div class="lab-susto" data-r="susto" aria-hidden="true"><img src="/party/cat-jumpscare.jpg" alt="" decoding="sync"></div><!-- [Kura] foto del susto -->'),
        # The design never re-checks achievements when the photo is completed or the pumpkin is found, so
        # "Tu pintaste eso?" and "la calabaza" never announced (founder hit it 2026-10-02). Check once the
        # full-screen overlay is gone — the banner sits under .lab-capa.
        ("    $.foto.classList.add('out'); setTimeout(() => { cerrar(relock); $.foto.classList.remove('out'); }, reducido ? 250 : 550);",
         "    $.foto.classList.add('out'); setTimeout(() => { cerrar(relock); $.foto.classList.remove('out'); revisarLogros(); /* [Kura] */ }, reducido ? 250 : 550);"),
        ("    despuesHallazgo = () => { if (lab.bailarCalabaza()) setTimeout(() => mensaje('¿Están… bailando?', 2800), 1800); };",
         "    despuesHallazgo = () => { revisarLogros(); /* [Kura] */ if (lab.bailarCalabaza()) setTimeout(() => mensaje('¿Están… bailando?', 2800), 1800); };"),
        # Cats' achievement: it's earned when the last cat lies down at the tomb and the lightning strikes, not
        # when the last object is handed over (founder 2026-10-02). 'acostadosYa' = the same scene replayed on
        # reload, without the lightning: whoever reaches it has done it.
        ("        else if (e === 'acostados') { const r = $.rayo; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }",
         "        else if (e === 'acostados') { const r = $.rayo; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); cache.gatosTumba = true; guardar(); setTimeout(revisarLogros, 1800); /* [Kura] */ }\n"
         "        else if (e === 'acostadosYa' && !cache.gatosTumba) { cache.gatosTumba = true; guardar(); revisarLogros(); /* [Kura] */ }"),
        # The pumpkin, when you see it: "Esto no estaba aquí antes… ¿acaso esto es…?", not "Recoger la calabaza".
        ("t.tipo === 'calabaza' ? 'Recoger la calabaza'", "t.tipo === 'calabaza' ? 'Esto no estaba aquí antes… ¿acaso esto es…?'"),
        ("t.tipo === 'calabaza' ? 'Una calabaza encendida. Pulsa E para recogerla.'", "t.tipo === 'calabaza' ? 'Esto no estaba aquí antes. Pulsa E para acercarte.'"),
        ("calabaza: 'Tomar',", "calabaza: '¿…?',"),
        # Every seal in the UI carries the star, like the Mausoleum's (founder 2026-10-02: "los más nuevos").
        ('<div class="lab-sello lab-sello-inv" aria-hidden="true"></div><b data-r="invSelloN"', '<div class="lab-sello lab-sello-inv" aria-hidden="true">★</div><b data-r="invSelloN"'),
        ("$.pSello.textContent = inicial(l.nombre);", "$.pSello.textContent = '★';"),
        ("s.textContent = inicial(l.nombre); s.classList.remove('estampa');", "s.textContent = '★'; s.classList.remove('estampa');"),
        # The Mausoleum shows what you carry from the cemetery (founder 2026-10-02: "confuso" when it vanished).
        # It has no 3D models of those things, so the labyrinth leaves their inventory pictures in localStorage
        # ('lab.mini': { id: dataURL }) and the Mausoleum paints them.
        ("    return (miniaturas[id] = H.R.domElement.toDataURL('image/png'));",
         "    const url = H.R.domElement.toDataURL('image/png');\n"
         "    try { const mm = JSON.parse(localStorage.getItem('lab.mini')) || {}; mm[id] = url; localStorage.setItem('lab.mini', JSON.stringify(mm)); } catch (_) {}   /* [Kura] para el Mausoleo */\n"
         "    return (miniaturas[id] = url);"),
        # Pause menu: no flashlight settings — only turning, sensitivity and invert axis (founder 2026-10-02).
        # The rows stay in the DOM (hidden) because the code that syncs them expects them; and a value saved
        # earlier no longer applies, so everyone gets the design's flashlight.
        ('    <div class="lab-fila"><label for="lab-lt">', '    <div class="lab-fila" hidden><label for="lab-lt">'),
        ('    <div class="lab-fila"><label for="lab-li">', '    <div class="lab-fila" hidden><label for="lab-li">'),
        ('    <div class="lab-fila"><label for="lab-ll">', '    <div class="lab-fila" hidden><label for="lab-ll">'),
        ('    <div class="lab-fila"><label for="lab-lp">', '    <div class="lab-fila" hidden><label for="lab-lp">'),
        ("  if (cache.linterna) lab.ajustarLinterna(cache.linterna);", "  /* [Kura] los ajustes de linterna ya no están en el menú: no se aplican los guardados */"),
        # Entry screen = the goal (founder 2026-10-02): "Encuentra el Mausoleo". It's back for everyone, also
        # arriving from the gate — its tap is what lets iPhone play the sound (skipping it left the page mute).
        ('aria-label="El laberinto. Haz clic o toca para entrar." hidden>\n  <h2>El laberinto</h2>',
         'aria-label="Encuentra el Mausoleo. Haz clic o toca para empezar." hidden>\n  <h2>Encuentra el Mausoleo</h2>'),
        # No "Ruta al Mausoleo" button (founder 2026-10-03): finding it is the game.
        ('<button type="button" class="lab-pill lab-ruta" data-r="btnRuta" aria-pressed="false">Ruta al Mausoleo</button>',
         '<button type="button" class="lab-pill lab-ruta" data-r="btnRuta" aria-pressed="false" hidden>Ruta al Mausoleo</button><!-- [Kura] sin botón de ruta -->'),
        # Photo pieces: only the count, not "n/4" (founder 2026-10-02).
        ("    if (n) { ps.componerFoto($.invFotoCv); $.invFotoN.textContent = `${n}/${tot}`; $.invFotoN.hidden = n === tot; }",
         "    if (n) { ps.componerFoto($.invFotoCv); $.invFotoN.textContent = `${n}`; $.invFotoN.hidden = n === tot; }   // [Kura] solo el número"),
        # (after the line above) the composed photo also goes to localStorage for the Mausoleum's inventory
        ("    if (n) { ps.componerFoto($.invFotoCv); $.invFotoN.textContent = `${n}`; $.invFotoN.hidden = n === tot; }   // [Kura] solo el número",
         "    if (n) { ps.componerFoto($.invFotoCv); $.invFotoN.textContent = `${n}`; $.invFotoN.hidden = n === tot; try { const mm = JSON.parse(localStorage.getItem('lab.mini')) || {}; mm.foto = $.invFotoCv.toDataURL('image/png'); localStorage.setItem('lab.mini', JSON.stringify(mm)); } catch (_) {} }   // [Kura] solo el número; la foto también va al Mausoleo"),
    ])
    edit("app.css", [
        (".lab-inv-sello.nuevo{animation:lab-estampa .42s cubic-bezier(.2,.8,.3,1) both}",
         ".lab-inv-sello.nuevo{animation:lab-estampa .42s cubic-bezier(.2,.8,.3,1) both}\n"
         "/* [Kura] cartas de tarot en el inventario */\n"
         ".lab-inv-carta{position:relative;width:60px;height:60px;display:grid;place-items:center}\n"
         ".lab-inv-carta canvas{display:block;width:30px;height:47px;border-radius:3px;transform:rotate(-8deg);filter:drop-shadow(0 2px 5px rgba(0,0,0,.6))}\n"
         ".lab-inv-carta b{position:absolute;right:-6px;bottom:2px;min-width:30px;height:22px;padding:0 6px;border-radius:11px;background:#0e0e11;border:1px solid rgba(201,195,182,.5);color:#e6e0d4;font:600 12px/20px \"Oswald\",system-ui,sans-serif;text-align:center;font-variant-numeric:tabular-nums}\n"
         ".lab-inv-carta.nuevo{animation:lab-estampa .42s cubic-bezier(.2,.8,.3,1) both}"),
        (".lab-susto.on{animation:lab-susto 1.1s ease-out both}",
         ".lab-susto.on{animation:lab-susto 2.1s ease-out both}\n"
         "/* [Kura] la foto del susto (la del gato de la reja): entra de golpe, tiembla y se va */\n"
         ".lab-susto img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0}\n"
         ".lab-susto.on img{animation:lab-susto-foto 2.1s cubic-bezier(.2,.9,.3,1) both}\n"
         "@keyframes lab-susto-foto{0%{opacity:1;transform:scale(1.35)}6%{transform:scale(1) translate(-6px,4px)}9%{transform:translate(5px,-3px)}12%{transform:translate(-3px,2px)}15%{transform:none}78%{opacity:1}100%{opacity:0}}"),

    ])
    edit("logros.js", [
        ("    gatos: () => encargos.length > 0 && encargos.every(id => (cache.encargos || {})[id] === 'entregado'),",
         "    gatos: () => encargos.length > 0 && encargos.every(id => (cache.encargos || {})[id] === 'entregado') && !!cache.gatosTumba,   // [Kura] y el rayo en la tumba"),
    ])
    # Guide cat: every time it stops to wait for the player, the "Creo que quiere que lo siga." line comes back
    # (the design only said it once, when the walk began — founder 2026-10-02).
    edit("deco.js", [
        ("      if (!g.espera && d > 5.5) g.espera = true; else if (g.espera && d < 3.6) g.espera = false;",
         "      if (!g.espera && d > 5.5) { g.espera = true; alEvento('sigueme'); /* [Kura] cada vez que se detiene a esperar */ } else if (g.espera && d < 3.6) g.espera = false;"),
    ])
    edit("logros.js", [
        ("ayuda = 'Los logros están en la capilla izquierda del Mausoleo.'", "ayuda = 'Los logros están en la capilla Marcador y logros del Mausoleo.'"),
    ])
    # Minimap markers (objects, cards, crows, cats…) only inside the explored part — they used to show through
    # the fog everywhere, giving away where things are (founder 2026-10-02).
    # No ✝ anywhere: iOS draws the character as an emoji on <canvas> (founder 2026-10-02). The sliding epitaph:
    edit("juegos/deslizante.js", [
        ("g.fillText('✝', S / 2, S * 0.14);", "/* [Kura] sin cruz: en iOS sale como emoji */"),
    ])
    # Effects: iOS's "interrupted" state (after leaving Safari) must be resumed too, not only "suspended".
    edit("sfx.js", [
        ("    if (AU.ctx.state === 'suspended') AU.ctx.resume();", "    if (AU.ctx.state !== 'running' && AU.ctx.state !== 'closed') AU.ctx.resume().catch(() => {});   // [Kura] también 'interrupted' (iOS)"),
    ])
    edit("motor.js", [
        ("    if (marcadores) {\n      const COLE",
         "    if (marcadores) {\n      ctx.save();   /* [Kura] marcadores solo dentro de lo ya explorado (no a través de la niebla) */\n"
         "      if (!completo) { ctx.beginPath(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (exp[y * W + x]) ctx.rect(x * s, y * s, s + .5, s + .5); ctx.clip(); }\n"
         "      const COLE"),
        ("\n    }\n    ctx.save(); ctx.translate(P.x / C * s, P.z / C * s);",
         "\n      ctx.restore();\n    }\n    ctx.save(); ctx.translate(P.x / C * s, P.z / C * s);"),
    ])
    edit("motor.js", [
        ("sello.position.set(0, 0.2, -0.469); sello.visible = l.tipo !== 'tumba';",
         "sello.position.set(0, 0.749, -0.469); sello.scale.setScalar(0.8); sello.visible = l.tipo !== 'tumba';   // [Kura, founder 2026-10-02] arriba, donde estaba la cruz (antes y = 0.2, al pie)"),
        ("    sello.add(new THREE.Mesh(GEO.sello, MAT.cera), mesh(GEO.selloIn, MAT.ceraIn, 0, 0, 0.002));",
         "    // [Kura, founder 2026-10-02] El mismo sello que el Mausoleo (el diseño más nuevo): disco de cera con canto, dos aros\n"
         "    // y la estrella — antes eran dos círculos planos.\n"
         "    { const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const sg = cv.getContext('2d');\n"
         "      sg.fillStyle = '#6e2c25'; sg.fillRect(0, 0, S, S);\n"
         "      sg.strokeStyle = '#55211b'; sg.lineWidth = 10; sg.beginPath(); sg.arc(64, 64, 54, 0, 6.29); sg.stroke();\n"
         "      sg.strokeStyle = '#84392f'; sg.lineWidth = 3; sg.beginPath(); sg.arc(64, 64, 47, 0, 6.29); sg.stroke();\n"
         "      sg.font = '700 54px Cinzel, Georgia, serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillStyle = '#e8cbbd';\n"
         "      // la tapa del cilindro, girada para mirar al frente, muestra la imagen 90° en el sentido del reloj: la letra va girada al revés\n"
         "      sg.translate(64, 64); sg.rotate(-Math.PI / 2);\n"
         "      sg.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 13 : 32; sg.lineTo(Math.cos(a) * r, Math.sin(a) * r); } sg.closePath(); sg.fill();   // estrella, como el sello de la mesa\n"
         "      const cara = keep(new THREE.MeshLambertMaterial({ map: tex(cv, null), emissive: 0x2a0d09 })), canto = keep(new THREE.MeshLambertMaterial({ color: 0x6e2c25 }));\n"
         "      const disco = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32)), [canto, cara, canto]); disco.rotation.x = Math.PI / 2; disco.position.z = 0.012; sello.add(disco); }"),

    ])
    # The final tomb's glitched date is the party date (niche I's prize) in a public file: only its length is used.
    mapa = os.path.join(LAB, "mapa.json")
    m = open(mapa, encoding="utf-8").read()
    if "31/10/2026" not in m:
        sys.exit("[sync] mapa.json: the final tomb's date moved — check what the glitch hides now")
    open(mapa, "w", encoding="utf-8").write(m.replace("31/10/2026", "00/00/0000"))

    # ---------- Mausoleum ----------
    os.makedirs(MAU, exist_ok=True)
    # Niches: ids and thresholds only — titles/texts live server-side (src/modules/party/lab-config.ts).
    n = json.load(open(os.path.join(src, "mausoleo/nichos.json"), encoding="utf-8"))
    json.dump({"version": n["version"],
               "nota": "Solo id y umbral: el título y el texto de cada nicho viven en el servidor (src/modules/party/lab-config.ts) y solo se mandan cuando el nicho está abierto.",
               "nichos": [{"id": x["id"], "umbral": x["umbral"]} for x in n["nichos"]]},
              open(os.path.join(MAU, "nichos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    shutil.copyfile(os.path.join(src, "mausoleo/logros.json"), os.path.join(MAU, "logros.json"))
    # (ouija.json is NOT published: its messages live server-side.)


    # Ambience in the Mausoleum (founder 2026-10-02): the same drone + organ as the labyrinth. Single source:
    # src/app/party/party-drone.ts, transpiled here to public/party/party-drone.js for this static page.
    out_dir = os.path.join(ROOT, "public/party")
    r = __import__("subprocess").run(["npx", "tsc", os.path.join(ROOT, "src/app/party/party-drone.ts"), "--target", "es2020",
                                      "--module", "es2020", "--outDir", out_dir, "--skipLibCheck"], capture_output=True, text=True, cwd=ROOT)
    if r.returncode or not os.path.exists(os.path.join(out_dir, "party-drone.js")):
        sys.exit("[sync] could not transpile party-drone.ts:\n" + r.stdout + r.stderr)
    html = open(os.path.join(src, MAUSOLEO_PAGE), encoding="utf-8").read()
    i = html.index('<script type="importmap">')
    j = html.index("</script>", i) + len("</script>")
    html = html[:i] + '<script type="importmap">\n{ "imports": { "three": "/party/vendor/three.module.min.js" } }\n</script>' + html[j:]
    html = patch(html, [
        ('<link rel="stylesheet" href="laberinto/app.css">', '<link rel="stylesheet" href="/party/laberinto/app.css">'),
        ("</script>\n<script type=\"importmap\">", """</script>
<script type="module">
// [Kura] La música ambiental sigue en el Mausoleo (zumbido + órgano, como en el laberinto; founder 2026-10-02).
// Arranca con el primer toque o tecla (los navegadores no dejan antes), sobre el mismo AudioContext que los
// efectos (window.__audio.ctx), entra suave y se apaga con fundido al ocultar o salir de la página.
import { startDrone, startOrgan, swellAmbience, pauseAmbienceWhenHidden, duckAmbience } from '/party/party-drone.js';
const au = (window.__audio = window.__audio || { ctx: null });
let sonando = false;
const arrancar = () => {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  const ctx = (au.ctx = au.ctx || new C());
  if (!sonando) { sonando = true; startDrone(ctx); startOrgan(ctx); swellAmbience(ctx); au.ducking = (segs, nivel, reemplazar) => duckAmbience(ctx, segs, nivel, reemplazar); }
  // iOS solo reanuda dentro de un TOQUE (arrastrar no cuenta): se sigue escuchando hasta que de verdad suene.
  const listo = () => ['click', 'touchend', 'keydown'].forEach(t => removeEventListener(t, arrancar, true));
  if (ctx.state === 'running') listo(); else ctx.resume().then(() => { if (ctx.state === 'running') listo(); }).catch(() => {});
};
['click', 'touchend', 'keydown'].forEach(t => addEventListener(t, arrancar, true));
pauseAmbienceWhenHidden(() => au.ctx);
</script>
<script type="importmap">"""),

        ("from './laberinto/api.js'", "from '/party/laberinto/api.js'"),
        ("from './laberinto/sfx.js'", "from '/party/laberinto/sfx.js'"),
        ("from './laberinto/texturas.js'", "from '/party/laberinto/texturas.js'"),
        ("from './laberinto/cartas.js'", "from '/party/laberinto/cartas.js'"),
        ("from './laberinto/logros.js'", "from '/party/laberinto/logros.js'"),
        ("fetch('laberinto/mapa.json', { cache: 'no-cache' })", "fetch('/party/laberinto/mapa.json', { cache: 'no-cache' })"),
        ("fetch('mausoleo/nichos.json', { cache: 'no-cache' })", "fetch('/party/mausoleo/nichos.json', { cache: 'no-cache' })"),
        ("fetch('mausoleo/logros.json', { cache: 'no-cache' })", "fetch('/party/mausoleo/logros.json', { cache: 'no-cache' })"),
        ("  fetch('mausoleo/ouija.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => null),",
         "  null,   // [Kura] los mensajes de la ouija viven solo en el servidor (src/modules/party/lab-config.ts)"),
        ("const LABERINTO_URL = q.get('volver') || 'Fase 3d - Laberinto cementerio.html';",
         "const LABERINTO_URL = '/party/laberinto' + (q.get('estado') === 'revelado' ? '?estado=revelado' : '');   // [Kura] sin ?volver= (sería un redirect abierto)"),
        ("const api = crearApi({ base: q.get('api'), red: q.get('red') || 'ok',",
         "const api = crearApi({ base: '/api/party/lab', red: 'ok',   /* [Kura] servidor real; sin ?api= ni ?red= */"),
        ("  if (q.get('dev') !== '0') {",
         "  if (q.get('dev') === '1' || q.get('dev') === 'abierta') {   // [Kura] la barra de desarrollo no sale por defecto"),
        ("<title>El Mausoleo</title>", f"""<title>El Mausoleo</title>
<!-- [Kura] Página del diseño "proto/{MAUSOLEO_PAGE}" copiada por scripts/sync-party-design.py; los cambios
     locales van marcados [Kura]. No editar a mano: editar el script y volver a correrlo. -->
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#07080b">
<meta name="description" content="Si te atreves.">
<meta property="og:title" content="El Mausoleo">
<meta property="og:description" content="Si te atreves.">
<meta property="og:image" content="/party/og-dark.jpg">
<script>
// [Kura] Un fundido entre páginas que el navegador se salta rechaza una promesa que nadie espera: sin ruido en consola.
addEventListener('pagereveal', function (e) {{ if (e.viewTransition) e.viewTransition.finished.catch(function () {{}}); }});
// [Kura] Detrás de la reja: antes de la apertura (hora local) aquí no hay nada. ?estado=revelado para pruebas.
(function(){{
  var q = new URLSearchParams(location.search);
  if (Date.now() < new Date(q.get('abre') || '{OPENS}').getTime() && q.get('estado') !== 'revelado') location.replace('/party');
}})();
</script>"""),
        ("</style>", """/* [Kura] Fundido entre páginas de /party (reja → laberinto → mausoleo) */
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){animation-duration:.45s}
</style>"""),
        # (2026-10-02) The entry screen stays also when arriving from the labyrinth: its tap is what lets iPhone
        # play sound. An earlier patch skipped it for smoother transitions and left the page mute.
        # The urn takes no seals without a signature (founder, 2026-10-02).
        ('  <div class="lab-msg" id="msg"></div>', """  <!-- [Kura] La urna no acepta sellos sin firma (founder, 2026-10-02): así todo el que entrega tiene nombre -->
  <section class="mau-ficha" id="urna-p" aria-labelledby="urna-t" hidden>
    <p class="mau-ficha-n">La urna</p>
    <h2 id="urna-t">Firma tus sellos</h2>
    <form class="mau-nombre" id="urna-form"><label for="urna-in">Tu nombre o apodo</label><div class="mau-nombre-fila"><input id="urna-in" maxlength="24" autocomplete="nickname" required><button class="lab-pill" type="submit">Firmar y dejar</button></div></form>
  </section>
  <div class="lab-msg" id="msg"></div>"""),
        ("  const ficha = $('ficha'), marP = $('marcador-p'), btnVolver = $('btn-volver'), tag = $('tag');",
         "  const ficha = $('ficha'), marP = $('marcador-p'), urnaP = $('urna-p'), btnVolver = $('btn-volver'), tag = $('tag');"),
        ("    mostrar(ficha, k === 'nicho'); mostrar(marP, k === 'marcador' && conPanelMarcador());",
         "    mostrar(ficha, k === 'nicho'); mostrar(marP, k === 'marcador' && conPanelMarcador()); mostrar(urnaP, false);"),
        ("""    if (!ids.length) { mensaje(misEntregados() ? 'Ya dejaste todos tus sellos en la urna.' : 'No traes sellos. Se ganan en las lápidas del laberinto.'); return; }
    ocupado = true; pintarUI(); setHover(null);""",
         """    if (!ids.length) { mensaje(misEntregados() ? 'Ya dejaste todos tus sellos en la urna.' : 'No traes sellos. Se ganan en las lápidas del laberinto.'); return; }
    if (!cache.apodo) { mostrar(urnaP, true); setTimeout(() => $('urna-in').focus({ preventScroll: true }), 60); return; }   // [Kura] firma primero
    mostrar(urnaP, false);
    ocupado = true; pintarUI(); setHover(null);"""),
        ("  let ultimoOuija = '';", """  // [Kura] Firmar en la urna y, en el mismo gesto, dejar los sellos
  $('urna-form').addEventListener('submit', async e => {
    e.preventDefault(); const b = $('urna-form').querySelector('button'); b.disabled = true;
    if (await firmar($('urna-in').value)) { mostrar(urnaP, false); mensaje(`Firmaste como ${cache.apodo}.`); depositar(); }
    b.disabled = false;
  });
  let ultimoOuija = '';"""),
        # Into / out of a chapel the camera went in a straight line and cut through the arch's pillar (founder
        # 2026-10-02). Now it curves through a point in the nave in front of the arch (quadratic Bézier).
        ("    look.yaw = look.pitch = look.z = 0; lookT.yaw = lookT.pitch = lookT.z = 0;\n    setHover(null); pintarUI();",
         "    // [Kura] entrar o salir de una capilla: la cámara pasa por delante del arco, no a través del pilar\n"
         "    if (CAPILLAS.includes(k) !== CAPILLAS.includes(prev.k)) { const sx = Math.sign(CAPILLAS.includes(k) ? meta.pos.x : p0.x) || 1; trans.via = new V3(sx * (XW - 0.9), (p0.y + meta.pos.y) / 2, ZC); }\n"
         "    look.yaw = look.pitch = look.z = 0; lookT.yaw = lookT.pitch = lookT.z = 0;\n    setHover(null); pintarUI();"),
        ("      cur.pos.lerpVectors(f.pos, meta.pos, k);",
         "      if (trans.via) { const a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k; cur.pos.set(a * f.pos.x + b * trans.via.x + c * meta.pos.x, a * f.pos.y + b * trans.via.y + c * meta.pos.y, a * f.pos.z + b * trans.via.z + c * meta.pos.z); }   /* [Kura] curva */\n"
         "      else cur.pos.lerpVectors(f.pos, meta.pos, k);"),
        # Tarot table: the camera was almost overhead (~77°), so the picked card's lift didn't read. A lower,
        # more oblique camera (~50°) shows it rising (founder 2026-10-02: "la inclinación de la cámara").
        ("    cartas: () => ({ pos: [CM.x - 0.42, CM_Y + 1.45, CM.z], target: [CM.x - 0.1, CM_Y, CM.z],",
         "    cartas: () => ({ pos: [CM.x - 0.95, CM_Y + 1.1, CM.z], target: [CM.x - 0.05, CM_Y, CM.z],   /* [Kura] cámara más inclinada */"),
        # Chapel names (founder 2026-10-02): left = "Marcador y logros", right = "Ouija y tarot".
        ("    if (id === 'capilla') return 'La ouija y las cartas';", "    if (id === 'capilla') return 'Ouija y tarot';   /* [Kura] nombre de la capilla */"),
        ("    if (id === 'capillaIzq') return 'El marcador y los logros';", "    if (id === 'capillaIzq') return 'Marcador y logros';   /* [Kura] nombre de la capilla */"),
        ("'Lleva tus cartas a la capilla de la ouija'", "'Lleva tus cartas a la capilla de Ouija y tarot'"),
        ("'Los logros están en la capilla izquierda.'", "'Los logros están en la capilla Marcador y logros.'"),
        # Every seal carries the star (founder 2026-10-02): the tombstones' seals flying to the urn and the inventory.
        ("g.fillText(inicial(nombreDe(id)), 64, 68);", "g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 13 : 32; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fill();   /* [Kura] estrella */"),
        ('<div class="lab-sello lab-sello-inv" aria-hidden="true"></div><b id="inv-n"', '<div class="lab-sello lab-sello-inv" aria-hidden="true">★</div><b id="inv-n"'),
        # No ✝ in the Mausoleum either (iOS emoji): the carved plaque and the ouija board's top.
        ("    grabar(g, '✝', W / 2, 26, '700 16px Cinzel, Georgia, serif', 0.7);\n", "    /* [Kura] sin cruz (en iOS sale como emoji) */\n"),
        ("tinta('✝', 600, 104, 40); ", "/* [Kura] sin cruz */ "),
        ("</body>", """<script>
// [Kura] Lo que traes del cementerio también se ve aquí (founder 2026-10-02): la fotografía (o sus pedazos) y los
// objetos que aún no entregas. El laberinto deja sus dibujos en localStorage['lab.mini'] al ponerlos en su inventario.
(function () {
  var c = {}, m = {};
  try { c = JSON.parse(localStorage.getItem('lab.v1')) || {}; m = JSON.parse(localStorage.getItem('lab.mini')) || {}; } catch (_) {}
  var inv = document.querySelector('.lab-inv'); if (!inv) return;
  var pistas = c.pistas || {}, piezas = ['foto1', 'foto2', 'foto3', 'foto4'].filter(function (k) { return pistas[k]; }).length;
  if (piezas && m.foto) {
    var f = document.createElement('div'); f.className = 'lab-inv-foto'; f.setAttribute('role', 'status');
    f.setAttribute('aria-label', piezas === 4 ? 'Fotografía completa.' : 'Fotografía: ' + piezas + ' de 4 pedazos.');
    var fi = new Image(); fi.alt = ''; fi.src = m.foto; fi.style.cssText = 'display:block;width:72px;height:54px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))'; f.appendChild(fi);
    if (piezas < 4) { var fb = document.createElement('b'); fb.setAttribute('aria-hidden', 'true'); fb.textContent = piezas; f.appendChild(fb); }
    inv.appendChild(f);
  }
  var l = document.createElement('div'); l.className = 'lab-inv-l'; l.setAttribute('role', 'list'); l.setAttribute('aria-label', 'Lo que traes del cementerio');
  var slot = function (id, etiqueta) {
    if (!m[id]) return;
    var d = document.createElement('div'); d.className = 'lab-slot'; d.dataset.estado = 'llevas'; d.setAttribute('role', 'listitem'); d.setAttribute('aria-label', etiqueta);
    var im = new Image(); im.alt = ''; im.src = m[id]; d.appendChild(im); l.appendChild(d);
  };
  Object.keys(c.encargos || {}).forEach(function (id) { if (c.encargos[id] === 'llevas') slot(id, 'Un encargo de los gatos, lo llevas'); });
  if (pistas.caja === 'llevas') slot('caja', 'Caja de música, la llevas');
  if (l.children.length) inv.appendChild(l);
})();
</script>
</body>"""),
        # Flashlight on touch screens: it points at the centre of the screen, like the gate (founder 2026-10-02).
        # With a mouse it keeps following the cursor.
        ("  const setAim = (x, y) => { const r = el.getBoundingClientRect();",
         "  let tactil = coarse; if (tactil) { aim.set(0, 0); aimT.set(0, 0); }   /* [Kura] en táctil la linterna va al centro */\n"
         "  const setAim = (x, y) => { if (tactil) { aimT.set(0, 0); return; } const r = el.getBoundingClientRect();"),
        ("el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); setAim(e.clientX, e.clientY);",
         "el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); tactil = e.pointerType !== 'mouse'; setAim(e.clientX, e.clientY);"),
        ("    if (e.isPrimary) setAim(e.clientX, e.clientY);",
         "    if (e.isPrimary) { if (e.pointerType === 'mouse') tactil = false; setAim(e.clientX, e.clientY); }"),
        # RSVP in the ouija (founder 2026-10-02): once the group revealed the place (niche III), after the spirit's
        # answer it asks "¿Vendrás?" (Sí / No) and, if yes, "¿Vendrás con alguien?". Saved in party_rsvp via
        # /api/party/lab/rsvp; the host sees it in /admin/party. Before the place is revealed it only hints.
        ('  <form class="mau-yo" id="ouija-form" hidden>',
         '  <form class="mau-yo" id="rsvp-form" hidden><span id="rsvp-q">¿Vendrás?</span><button class="lab-pill" type="button" data-rsvp="si">Sí</button><button class="lab-pill" type="button" data-rsvp="no">No</button></form><!-- [Kura] confirmación -->\n'
         '  <form class="mau-yo" id="ouija-form" hidden>'),
        ("    if (r && vivo()) moverFondo(r.texto, vivo);\n  }",
         "    if (r && vivo()) moverFondo(r.texto, vivo).then(() => { if (vivo()) rsvpTalvez(vivo); });   /* [Kura] luego, la confirmación */\n  }\n"
         "  // [Kura] Confirmación de asistencia por la ouija\n"
         "  const rsvpApi = (method, body) => fetch('/api/party/lab/rsvp', { method, headers: { 'Content-Type': 'application/json', 'X-Dispositivo': cache.dispositivo }, body: body ? JSON.stringify(body) : undefined }).then(r => r.ok ? r.json() : Promise.reject(r.status));\n"
         "  const rsvpForm = $('rsvp-form'), rsvpQ = $('rsvp-q');\n"
         "  const rsvpPreguntar = q => new Promise(res => { rsvpQ.textContent = q; rsvpForm.hidden = false; rsvpForm.querySelectorAll('button').forEach(b => { b.onclick = () => { rsvpForm.hidden = true; res(b.dataset.rsvp === 'si'); }; }); rsvpForm.querySelector('button').focus({ preventScroll: true }); });\n"
         "  async function rsvpTalvez(vivo) {\n"
         "    let e; try { e = await rsvpApi('GET'); } catch (_) { return; }\n"
         "    if (!vivo() || vista.k !== 'ouija') return;\n"
         "    if (!e.abierta) { mensaje('Siento que quiere preguntarme algo… pero todavía no sé a dónde iría.', 4600); return; }\n"
         "    if (e.respuesta) { mensaje(e.respuesta.va ? 'Ya le dije que iré.' : 'Ya le dije que no iré.', 3200); return; }\n"
         "    mensaje('La plancheta se mueve sola… me está preguntando algo.', 3600); await espera(reducido ? 0 : 1200); if (!vivo()) return;\n"
         "    const va = await rsvpPreguntar('¿Vendrás?'); if (!vivo()) return;\n"
         "    const acompanante = va ? await rsvpPreguntar('¿Vendrás con alguien?') : false; if (!vivo()) return;\n"
         "    sesion = true; pintarUI(); rocePrender(); await mover(va ? 'SI' : 'NO', 0.8); await espera(500); await mover('CENTRO', 0.7); roceApagar(); sesion = false; pintarUI();\n"
         "    try { await rsvpApi('POST', { va, acompanante }); mensaje(va ? (acompanante ? 'Así quedó escrito. Nos esperan a los dos.' : 'Así quedó escrito. Me esperan.') : 'Así quedó escrito. No iré.', 4200); }\n"
         "    catch (_) { mensaje('La plancheta se detuvo… no quedó escrito. Debería intentarlo otra vez.', 4200); }\n"
         "  }"),
        ("    if (prev.k === 'ouija' && k !== 'ouija') { ouTok++; hablando = sesion = false; roceApagar(); }",
         "    if (prev.k === 'ouija' && k !== 'ouija') { ouTok++; hablando = sesion = false; roceApagar(); $('rsvp-form').hidden = true; }   /* [Kura] */"),
        ("""  $('p-entregar').onclick = async () => {
    const b = $('p-entregar'); b.disabled = true;""", """  $('p-entregar').onclick = async () => {
    // [Kura] tampoco sin firma en la vista 2D
    if (!cache.apodo) { const v = prompt('Firma tus sellos: tu nombre o apodo'); if (!v || !(await firmar(v))) return; }
    const b = $('p-entregar'); b.disabled = true;"""),
        # Tarot table hint, Wordle/Mastermind style (founder 2026-10-03): with all the cards on the table and the
        # spread still wrong, it says how many are in their place and how many face the right way (each card's own
        # orientation, wherever it sits). Same counts in the 2D panel.
        ("const tiradaCorrecta = () => CARTAS.length > 0 && CARTAS.every((c, k) => { const s = mesa()[k]; return s && s.id === c.id && s.inv === !!c.invertida; });",
         "const tiradaCorrecta = () => CARTAS.length > 0 && CARTAS.every((c, k) => { const s = mesa()[k]; return s && s.id === c.id && s.inv === !!c.invertida; });\n"
         "/* [Kura] pista de la mesa: cuántas en su lugar y cuántas bien orientadas */\n"
         "const pistaTirada = () => { const ss = mesa().filter(Boolean), lugar = mesa().filter((s, k) => s && CARTAS[k] && s.id === CARTAS[k].id).length, giro = ss.filter(s => cartaDe(s.id) && s.inv === !!cartaDe(s.id).invertida).length;\n"
         "  return `${lugar === 1 ? '1 está en su lugar' : `${lugar} están en su lugar`} y ${giro === 1 ? '1 está bien orientada' : `${giro} están bien orientadas`}`; };"),
        ("enMesa().length === CARTAS.length ? 'Todavía no están en el orden correcto' : '';",
         "enMesa().length === CARTAS.length ? 'Todavía no están en el orden correcto. ' + pistaTirada() + '.' : '';   /* [Kura] */"),
        ("    mensaje('Están todas, pero algo no cuadra. ¿En qué orden irán?', 3800);",
         "    mensaje(`Están todas, pero algo no cuadra: ${pistaTirada()}.`, 4600);   /* [Kura] */"),
        ("  function comprobar() {\n    if (!tiradaCorrecta()) return;",
         "  function comprobar() {\n    if (!tiradaCorrecta()) { if (enMesa().length === CARTAS.length) mensaje(pistaTirada().replace(/^./, m => m.toUpperCase()) + '.', 4200); return; }   /* [Kura] pista */"),
        # The last niche holds an instant photo (founder 2026-10-03): the host's tombstone with its real death date,
        # floating in front of the camera while that niche is in view. Drag = turn it, tap = flip it; the question is
        # handwritten on the back. Its data (`foto`) comes from the server with the open niche (lab-config.ts).
        ("&family=Cinzel:wght@400;700&display=swap", "&family=Cinzel:wght@400;700&family=Caveat:wght@600&display=swap"),
        ("import { texMuro, texAdoquin, texPiedra, texSuelo, texLetrero, fbm, rng } from '/party/laberinto/texturas.js';",
         "import { texMuro, texAdoquin, texPiedra, texSuelo, texLetrero, texGrabado, fbm, rng } from '/party/laberinto/texturas.js';"),
        ("cache.mau.contenido[n.id] = { titulo: n.titulo, texto: n.texto };",
         "cache.mau.contenido[n.id] = { titulo: n.titulo, texto: n.texto, foto: n.foto || null };   /* [Kura] instantánea */"),
        ("  return c ? { titulo: c.titulo, texto: c.texto, estado: '' } :",
         "  return c ? { titulo: c.titulo, texto: c.texto, estado: '', foto: c.foto || null } :"),
        ("    li.querySelector('h2').textContent = c.titulo; li.querySelector('p').textContent = c.texto;",
         "    li.querySelector('h2').textContent = c.titulo; li.querySelector('p').textContent = c.foto ? `Una instantánea de la lápida de ${c.foto.nombre}: ${c.foto.fechas}. Al reverso, escrito a mano: ${c.foto.reverso}` : c.texto;   /* [Kura] */"),
        ("    if (pointers.size === 1) { const k = cam.fov * D2R / stage.clientHeight; lookT.yaw += dx * k; lookT.pitch += dy * k; }",
         "    if (pointers.size === 1 && fotoVisible()) { if (!finalOn) fotoRotT += dx * 0.011; }   /* [Kura] arrastrar gira la instantánea */\n"
         "    else if (pointers.size === 1) { const k = cam.fov * D2R / stage.clientHeight; lookT.yaw += dx * k; lookT.pitch += dy * k; }"),
        ("      if (moved < 8 && dt < 500) { toNdc(e.clientX, e.clientY);",
         "      if (fotoVisible()) { if (moved < 8 && dt < 500) fotoGirar(); else fotoAsentar(); return; }   /* [Kura] */\n"
         "      if (moved < 8 && dt < 500) { toNdc(e.clientX, e.clientY);"),
        ("    if (vista.k === 'afuera' || e.target.closest('input')) return;\n    if (vista.k === 'cartas' && !trans) {",
         "    if (vista.k === 'afuera' || finalOn || e.target.closest('input')) return;   /* [Kura] sin teclado durante el final */\n    if (vista.k === 'cartas' && !trans) {"),
        ("    mostrar(ficha, k === 'nicho'); mostrar(marP,",
         "    mostrar(ficha, k === 'nicho' && !fotoDe(i));   /* [Kura] con la instantánea no hay ficha */ mostrar(marP,"),
        ("    if (k === 'ouija') trans.onEnd = hablarOuija;",
         "    if (k === 'ouija') trans.onEnd = hablarOuija;\n"
         "    if (k === 'nicho' && fotoDe(i)) trans.onEnd = () => { if (vista.k === 'nicho') mensaje(contenidoNicho(NICHOS[i]).texto, 5600); };   /* [Kura] lo dice el personaje */"),
        ("    const i = +id.slice(1); if (vista.k === 'nicho' && vista.i === i) return;",
         "    const i = +id.slice(1); if (vista.k === 'nicho' && vista.i === i) { if (fotoVisible()) fotoGirar(); return; }   /* [Kura] */"),
        ("    if (pointerDirty && !trans) { pointerDirty = false; if (conMouse()) setHover(pick()); }",
         "    fotoTick(dt);   /* [Kura] */\n"
         "    if (pointerDirty && !trans) { pointerDirty = false; if (conMouse()) setHover(fotoVisible() ? null : pick()); }"),
        ("  function act(id, k) {\n    if (!id || vista.k === 'afuera') return;", """  // [Kura] ---------- Instantánea del último nicho: la lápida del anfitrión con su fecha, y la pregunta al reverso ----------
  const fotoDe = i => { const n = NICHOS[i]; return (n && n.abierto && (cache.mau.contenido[n.id] || {}).foto) || null; };
  const fotoVisible = () => vista.k === 'nicho' && !trans && !!fotoDe(vista.i);
  let foto3D = null, fotoClave = '', fotoRot = 0, fotoRotT = 0, fotoK = 0, fotoInv = false;
  function texFoto(d) {
    const W = 660, H = 800, X = 40, Y = 40, S = 580;
    const papel = (g, a, b) => { const p = g.createLinearGradient(0, 0, W, H); p.addColorStop(0, a); p.addColorStop(1, b); g.fillStyle = p; g.fillRect(0, 0, W, H); };
    const f = lienzo(W, H), g = f.getContext('2d'); papel(g, '#efe9dc', '#ded6c6');
    g.save(); g.beginPath(); g.rect(X, Y, S, S); g.clip();
    const cielo = g.createLinearGradient(0, Y, 0, Y + S); cielo.addColorStop(0, '#07090f'); cielo.addColorStop(0.7, '#12161f'); cielo.addColorStop(1, '#0d0f12'); g.fillStyle = cielo; g.fillRect(X, Y, S, S);
    const R = rng(77);
    for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(150,160,175,${0.03 + R() * 0.03})`; g.beginPath(); g.ellipse(X + R() * S, Y + S * (0.45 + R() * 0.3), 150 + R() * 160, 30 + R() * 30, 0, 0, 6.29); g.fill(); }
    // La losa: la misma cara grabada del laberinto, con su remate redondo
    const cara = texGrabado(d.nombre, d.fechas, piedraC), LW = 430, LH = LW * cara.height / cara.width, LX = W / 2 - LW / 2, LB = Y + S - 40, LY = LB - LH;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(W / 2 + 26, LB + 6, LW * 0.72, 30, 0, 0, 6.29); g.fill();
    g.save(); g.beginPath(); g.arc(W / 2, LY + 2, LW / 2, Math.PI, 0); g.closePath(); g.fillStyle = g.createPattern(piedraC, 'repeat'); g.fill(); g.restore();
    g.drawImage(cara, LX, LY, LW, LH);
    g.fillStyle = 'rgba(20,22,30,.16)'; g.beginPath(); g.arc(W / 2, LY + 2, LW / 2, Math.PI, 0); g.rect(LX, LY, LW, LH); g.fill();
    const sombra = g.createLinearGradient(LX, 0, LX + LW, 0); sombra.addColorStop(0, 'rgba(0,0,0,0)'); sombra.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = sombra; g.fillRect(LX, LY - LW / 2, LW, LH + LW / 2);
    // Tierra y pasto al pie
    const suelo = g.createLinearGradient(0, LB - 14, 0, Y + S); suelo.addColorStop(0, '#191a14'); suelo.addColorStop(1, '#0a0b08'); g.fillStyle = suelo; g.fillRect(X, LB - 6, S, Y + S - LB + 6);
    for (let i = 0; i < 150; i++) { const x = X + R() * S, y = LB - 8 + R() * 26, h = 8 + R() * 18; g.strokeStyle = `rgba(${44 + R() * 24},${56 + R() * 26},${34 + R() * 14},.85)`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 8, y - h); g.stroke(); }
    // Flash de cámara: claro al centro, viñeta y grano
    const flash = g.createRadialGradient(W / 2, LY + LH * 0.45, 30, W / 2, LY + LH * 0.45, S * 0.86); flash.addColorStop(0, 'rgba(255,238,205,.14)'); flash.addColorStop(0.55, 'rgba(255,238,205,.04)'); flash.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = flash; g.fillRect(X, Y, S, S);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${R() * 0.07})`; g.fillRect(X + R() * S, Y + R() * S, 1.6, 1.6); }
    g.restore();
    g.strokeStyle = 'rgba(60,50,40,.35)'; g.lineWidth = 2; g.strokeRect(X, Y, S, S);
    const r = lienzo(W, H), h = r.getContext('2d');
    const pintarReverso = () => {
      papel(h, '#d6cfbf', '#c4bcab');
      h.fillStyle = 'rgba(60,52,44,.1)'; h.fillRect(X, Y, S, S); h.strokeStyle = 'rgba(60,50,40,.22)'; h.lineWidth = 2; h.strokeRect(X, Y, S, S);
      let fs = 118; const fuente = () => `600 ${fs}px Caveat, "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`, palabras = d.reverso.split(' ');
      const partir = () => { const ls = []; let l = ''; h.font = fuente(); for (const w of palabras) { const t = l ? l + ' ' + w : w; if (l && h.measureText(t).width > S - 90) { ls.push(l); l = w; } else l = t; } ls.push(l); return ls; };
      let ls = partir(); while (fs > 48 && (ls.length > 3 || ls.some(l => h.measureText(l).width > S - 70))) { fs -= 6; ls = partir(); }
      h.save(); h.translate(W / 2, Y + S / 2); h.rotate(-0.07); h.textAlign = 'center'; h.textBaseline = 'middle'; h.fillStyle = '#231c1a';
      ls.forEach((l, i) => h.fillText(l, (i % 2 ? 14 : -10), (i - (ls.length - 1) / 2) * fs * 1.02));
      const wU = Math.min(S - 120, h.measureText(ls[ls.length - 1]).width), yU = ((ls.length - 1) / 2) * fs * 1.02 + fs * 0.58;
      h.strokeStyle = '#231c1a'; h.lineWidth = 5; h.lineCap = 'round'; h.beginPath(); h.moveTo(-wU / 2, yU + 6); h.quadraticCurveTo(0, yU - 8, wU / 2, yU + 2); h.stroke();
      h.restore();
    };
    pintarReverso();
    return { f, r, pintarReverso };
  }
  function crearFoto(d) {
    if (foto3D) { cam.remove(foto3D); foto3D.traverse(o => { if (o.material) { o.material.map.dispose(); o.material.dispose(); } }); }
    const t = texFoto(d), AN = 0.825, geo = new THREE.PlaneGeometry(AN, 1);
    const mat = c => new THREE.MeshBasicMaterial({ map: tex(c, 1, 1, true, true), color: 0xe2ddd2, toneMapped: false, fog: false, depthTest: false, depthWrite: false, transparent: true });
    const frente = new THREE.Mesh(geo, mat(t.f)), reverso = new THREE.Mesh(geo, mat(t.r)); reverso.rotation.y = Math.PI;
    foto3D = new THREE.Group(); foto3D.name = 'instantanea'; foto3D.add(frente, reverso); frente.renderOrder = reverso.renderOrder = 999; foto3D.visible = false; cam.add(foto3D);
    // La letra a mano llega después: se vuelve a pintar el reverso cuando carga la fuente
    document.fonts.load('600 60px Caveat').then(() => { t.pintarReverso(); reverso.material.map.needsUpdate = true; }).catch(() => {});
  }
  const fotoCara = () => Math.abs(Math.round(fotoRotT / Math.PI)) % 2;   // 0 frente, 1 reverso
  function fotoDecir() { const d = fotoDe(vista.i); if (d) $('live').textContent = fotoCara() ? `Al reverso, escrito a mano: ${d.reverso}` : `Una instantánea de la lápida de ${d.nombre}: ${d.fechas}`; }
  function fotoGirar() { if (finalOn) return; fotoRotT = (Math.round(fotoRotT / Math.PI) + 1) * Math.PI; sfx('flip', 0.4); fotoDecir(); if (fotoCara()) fotoFinal(); }
  function fotoAsentar() { if (finalOn) return; fotoRotT = Math.round(fotoRotT / Math.PI) * Math.PI; sfx('flip', 0.25); fotoDecir(); if (fotoCara()) fotoFinal(); }
  // El final (founder 2026-10-03): al ver el reverso ya no se puede tocar nada; cae un rayo, todo se vuelve blanco,
  // se tiñe de negro y pasan los créditos. Una vez por dispositivo (cache.mau.finalVisto); después la foto queda libre.
  let finalOn = false;
  // Ya visto el final, con la foto por el reverso queda un botón para volver a ver los créditos
  const btnCred = document.createElement('button'); btnCred.type = 'button'; btnCred.className = 'lab-pill'; btnCred.textContent = 'Ver los créditos';
  btnCred.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:max(84px,calc(env(safe-area-inset-bottom) + 56px));z-index:8;display:none';
  ui.appendChild(btnCred); btnCred.addEventListener('click', () => fotoFinal(true));
  async function fotoFinal(otraVez) {
    if (finalOn || (cache.mau.finalVisto && !otraVez)) return; finalOn = true; setHover(null);
    // La canción de los créditos (public/party/sfx/creditos-0.m4a, del founder). Se arranca AQUÍ, muda, dentro del
    // toque que volteó la foto: iOS no deja empezar un audio después, sin gesto. Va por el AudioContext para poder
    // subirla y bajarla con fundido; sin contexto (nunca hubo sonido) no hay música.
    const AU = window.__audio, AC = AU && AU.ctx; let musica = null;
    try { if (AC) { const a = new Audio('/party/sfx/creditos-0.m4a'), g = AC.createGain(); a.preload = 'auto'; g.gain.value = 0; AC.createMediaElementSource(a).connect(g).connect(AC.destination); a.play().catch(() => {}); musica = { a, g }; } } catch (_) {}
    const sonar = () => { if (!musica) return; try { musica.a.currentTime = 0; musica.a.play().catch(() => {}); } catch (_) {} musica.g.gain.setTargetAtTime(0.9, AC.currentTime, 0.7); if (AU.ducking) AU.ducking((isFinite(musica.a.duration) && musica.a.duration) || 320, 0.0001, true); };
    const callarMusica = () => { if (!musica) return; const m = musica; musica = null; m.g.gain.setTargetAtTime(0, AC.currentTime, 0.45); setTimeout(() => { try { m.a.pause(); } catch (_) {} }, 2400); if (AU.ducking) AU.ducking(0.4, 0.0001, true); };
    const d = fotoDe(vista.i) || {}, el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    const st = el('style'); st.textContent = `
.mau-final{position:fixed;inset:0;z-index:80;background:rgba(255,255,255,0);overflow:hidden;touch-action:none;color:#c9c3b6;text-align:center}
.mau-final.blanco{background:#fff}
.mau-final.negro{background:#000;transition:background 3.4s ease-in}
.mau-final-rollo{position:absolute;left:0;right:0;top:0;padding:0 24px;display:flex;flex-direction:column;align-items:center;gap:44px;opacity:0;transition:opacity 1.2s}
.mau-final-rollo.on{opacity:1}
.mau-final h1{margin:0;font:400 clamp(44px,11vw,84px)/1 "Creepster",system-ui,sans-serif;letter-spacing:.04em;color:#9e3b30;text-wrap:balance}
.mau-final h2{margin:0 0 10px;font:500 12px/1 "Oswald",system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#8d877b}
.mau-final p{margin:0;font:400 clamp(19px,4.6vw,26px)/1.45 "Cinzel",Georgia,serif;text-wrap:balance}
.mau-final p.chico{font-size:clamp(15px,3.6vw,18px);color:#8d877b}
.mau-final-fin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:24px;opacity:0;transition:opacity 1.6s;pointer-events:none}
.mau-final-fin.on{opacity:1;pointer-events:auto}
.mau-final-saltar{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));opacity:0;transition:opacity .8s}
.mau-final-saltar.on{opacity:.75}
.mau-final a.lab-pill{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box}
.mau-final-fin .mau-final-b{display:flex;flex-direction:column;align-items:center;gap:12px}
.mau-final.quieto{overflow-y:auto;touch-action:pan-y}
.mau-final.quieto .mau-final-rollo{position:static;padding:15vh 24px}
.mau-final.quieto .mau-final-fin{position:static;padding:0 24px 15vh}`;
    const v = el('div', 'mau-final'); v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Créditos'); v.appendChild(st); document.body.appendChild(v);
    ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'click'].forEach(t => v.addEventListener(t, e => e.stopPropagation()));
    const elenco = cargarMarcador().then(m => (m && m.elenco) || (m && m.top || []).map(f => f.apodo)).catch(() => []);
    await espera(otraVez ? 350 : reducido ? 900 : 1900);
    sfx.trueno(); shake = 1.4; v.classList.add('blanco');
    await espera(750); v.classList.add('negro'); await espera(3600);
    const rollo = el('div', 'mau-final-rollo'), bloque = (t, ls, c) => { const b = el('div'); if (t) b.appendChild(el('h2', '', t)); ls.forEach(l => b.appendChild(el('p', c || '', l))); rollo.appendChild(b); };
    rollo.appendChild(el('h1', '', (d.reverso || '').replace(/[¡!]/g, '')));
    bloque('En memoria de', [d.nombre || '', d.fechas || '']);
    NICHOS.slice(0, 5).forEach(n => { const c = cache.mau.contenido[n.id]; if (c && c.titulo) bloque(c.titulo, [c.texto]); });
    const nombres = await elenco; if (nombres.length) bloque('Quienes abrieron los nichos', nombres);
    bloque('', ['Ichigo-Ichie', '一期一会']);   // el agradecimiento del founder: un encuentro, una sola vez
    bloque('', ['El culpable estará en la fiesta.'], 'chico');
    const fecha = (cache.mau.contenido[NICHOS[0].id] || {}).texto, fin = el('div', 'mau-final-fin'), volverB = el('button', 'lab-pill', 'Volver al Mausoleo'); volverB.type = 'button';
    const calB = el('a', 'lab-pill', 'Agregar al calendario'); calB.href = '/api/party/lab/calendario';
    const botones = el('div', 'mau-final-b'); botones.append(calB, volverB);
    fin.appendChild(el('p', '', fecha ? `Nos vemos el ${fecha}` : 'Nos vemos en la fiesta')); fin.appendChild(botones);
    const saltar = el('button', 'lab-pill mau-final-saltar', 'Saltar'); saltar.type = 'button';
    v.append(rollo, fin, saltar);
    $('live').textContent = [...rollo.querySelectorAll('h1,h2,p')].map(x => x.textContent).join('. ');
    const cerrar = () => { callarMusica(); cache.mau.finalVisto = true; guardar(); v.style.transition = 'opacity 1.2s'; v.style.opacity = '0'; setTimeout(() => { v.remove(); finalOn = false; }, 1250); };
    volverB.addEventListener('click', cerrar);
    const terminar = () => { rollo.classList.remove('on'); saltar.remove(); fin.classList.add('on'); calB.focus({ preventScroll: true }); };
    sonar();
    if (reducido) { v.classList.add('quieto'); rollo.classList.add('on'); fin.classList.add('on'); saltar.remove(); return; }
    await espera(60); const alto = rollo.scrollHeight, vh = v.clientHeight;
    const anim = rollo.animate([{ transform: `translateY(${vh}px)` }, { transform: `translateY(${-alto}px)` }], { duration: (vh + alto) / 42 * 1000, easing: 'linear', fill: 'both' });
    rollo.classList.add('on'); saltar.classList.add('on');
    anim.onfinish = terminar; saltar.addEventListener('click', () => { anim.cancel(); rollo.style.transform = `translateY(${-alto}px)`; terminar(); });
  }
  function fotoTick(dt) {
    const d = vista.k === 'nicho' ? fotoDe(vista.i) : null, on = !!d && !trans;
    { const ver = on && cache.mau.finalVisto && !finalOn && fotoCara() === 1; if (ver && btnCred.style.display) callar(); btnCred.style.display = ver ? '' : 'none'; }
    // Con la instantánea a la vista no queda nada más en pantalla (founder 2026-10-03): ni inventario, ni contador,
    // ni ficha (ver ir()); solo la foto, lo que dice el personaje y el botón de volver.
    if (!!d !== fotoInv) { fotoInv = !!d; ['.lab-inv', '#total', '#pista', '#tag'].forEach(q => { const x = ui.querySelector(q); if (x) { x.style.transition = 'opacity .4s'; x.style.opacity = d ? '0' : ''; x.style.pointerEvents = d ? 'none' : ''; } }); $('msg').style.bottom = d && stage.clientWidth <= 520 ? 'max(28px, env(safe-area-inset-bottom))' : ''; if (!d) callar(); }
    if (d) { const clave = d.nombre + '|' + d.fechas + '|' + d.reverso; if (clave !== fotoClave) { fotoClave = clave; crearFoto(d); } }
    if (!foto3D) return;
    fotoK += ((on ? 1 : 0) - fotoK) * (1 - Math.exp(-dt * (on ? 5 : 9)));
    if (!on && fotoK < 0.01) { fotoK = 0; fotoRot = fotoRotT = 0; foto3D.visible = false; return; }
    fotoRot += (fotoRotT - fotoRot) * (1 - Math.exp(-dt * 9));
    const W = stage.clientWidth, H = stage.clientHeight, fr = libre(), D = 0.6, tV = Math.tan(cam.fov / 2 * D2R), tH = tV * W / H;
    const s = Math.min(fr.h / H * 2 * D * tV * 0.82, fr.w / W * 2 * D * tH * 0.95 / 0.825), e = reducido ? 1 : fotoK;
    foto3D.visible = true; foto3D.scale.setScalar(s * (0.7 + 0.3 * e));
    foto3D.position.set(((fr.l + fr.r) / W - 1) * tH * D, (1 - (fr.t + fr.b) / H) * tV * D - (1 - e) * 0.12, -D);
    foto3D.rotation.set(0, fotoRot, -0.035 * Math.cos(fotoRot));
    foto3D.children.forEach(m => { m.material.opacity = Math.min(1, e * 1.4); });
  }

  function act(id, k) {
    if (!id || vista.k === 'afuera') return;"""),
    ], MAUSOLEO_PAGE)
    open(os.path.join(MAU, "index.html"), "w", encoding="utf-8").write(html)
    check_syntax(html)
    print("[sync] ok — public/party/laberinto and public/party/mausoleo updated")


def check_syntax(mausoleo_html):
    """Every module must parse: a patch that breaks one would ship a dead labyrinth (it happened, 2026-10-02)."""
    import re
    import subprocess
    import tempfile
    bad = []
    with tempfile.TemporaryDirectory() as tmp:
        files = [os.path.join(dp, f) for dp, _, fs in os.walk(LAB) for f in fs if f.endswith(".js")]
        pages = []
        for n, body in enumerate(re.findall(r'<script type="module">([\s\S]*?)</script>', mausoleo_html)):
            page = os.path.join(tmp, f"mausoleo-page-{n}.mjs")
            open(page, "w", encoding="utf-8").write(body)
            pages.append(page)
        files.append(os.path.join(ROOT, "public/party/party-drone.js"))
        for f in files + pages:
            probe = os.path.join(tmp, "probe.mjs")
            shutil.copyfile(f, probe)
            r = subprocess.run(["node", "--check", probe], capture_output=True, text=True)
            if r.returncode:
                bad.append(f"{os.path.relpath(f, ROOT) if f not in pages else 'mausoleo/index.html <script type=module>'}:\n{r.stderr.strip()[:400]}")
    if bad:
        sys.exit("[sync] syntax errors — nothing is safe to deploy:\n" + "\n".join(bad))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(os.path.abspath(sys.argv[1]))
