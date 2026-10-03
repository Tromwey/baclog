// Efectos de sonido sintetizados (0 KB de archivos). Usa window.__audio.ctx, el mismo AudioContext de la intro.
export function crearSfx() {
  const AU = window.__audio = window.__audio || { ctx: null };
  let ruido = null;
  function ctx() {
    if (!AU.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AU.ctx = new C(); }
    if (AU.ctx.state !== 'running' && AU.ctx.state !== 'closed') AU.ctx.resume().catch(() => {});   // [Kura] también 'interrupted' (iOS)
    return AU.ctx;
  }
  function buffRuido(c) {
    if (ruido) return ruido;
    ruido = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ruido;
  }
  function tono(c, t, f, dur, vol, tipo = 'sine', f2) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function soplo(c, t, dur, vol, frec, q = 1.2, tipo = 'bandpass') {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buffRuido(c); f.type = tipo; f.frequency.value = frec; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur + 0.02);
  }
  const SON = {
    flip:  (c, t, v) => { soplo(c, t, 0.07, 0.5 * v, 2600 + Math.random() * 900, 0.9); },
    tink:  (c, t, v) => { tono(c, t, 1568, 0.45, 0.22 * v); tono(c, t, 2352, 0.3, 0.08 * v); },
    bell:  (c, t, v) => { tono(c, t, 1047, 0.6, 0.2 * v); tono(c, t + 0.12, 1568, 0.9, 0.2 * v); tono(c, t + 0.12, 3136, 0.5, 0.05 * v); },
    thud:  (c, t, v) => { tono(c, t, 120, 0.28, 0.6 * v, 'sine', 48); soplo(c, t, 0.12, 0.35 * v, 500, 0.7, 'lowpass'); },
    toll:  (c, t, v) => { [[196, .22], [392, .1], [507, .07], [784, .03]].forEach(([f, a]) => tono(c, t, f, 1.8, a * v)); },
    click: (c, t, v) => { soplo(c, t, 0.03, 0.4 * v, 3800, 2); tono(c, t, 2100, 0.03, 0.06 * v, 'square'); },
  };
  const sfx = (nombre, vol = 1) => { const c = ctx(); if (!c || !SON[nombre]) return; try { SON[nombre](c, c.currentTime + 0.005, vol); } catch (_) {} };
  sfx.desbloquear = () => { const c = ctx(); if (c) { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } };
  // Clic del interruptor de la linterna, idéntico al de la intro de la reja
  sfx.linterna = (retraso = 0) => {
    const c = ctx(); if (!c) return; const sr = c.sampleRate, t = c.currentTime + 0.005 + retraso;
    const buf = c.createBuffer(1, Math.round(sr * 0.04), sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
    [[0, 1700, 0.7], [0.06, 2900, 0.4]].forEach(([o, f, g]) => {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), gn = c.createGain();
      s.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.4; gn.gain.value = g;
      s.connect(bp).connect(gn).connect(c.destination); s.start(t + o);
    });
  };
  // Notas de las velas del Simon (do-mi-sol-do), con un armónico suave
  const NOTAS = [262, 330, 392, 523, 587, 659];
  sfx.nota = (i, dur = 0.42) => { const c = ctx(); if (!c) return; const t = c.currentTime + 0.005, f = NOTAS[i % NOTAS.length]; tono(c, t, f, dur, 0.2, 'triangle'); tono(c, t, f * 2, dur * 0.7, 0.05); };
  sfx.error = () => { const c = ctx(); if (!c) return; const t = c.currentTime + 0.005; tono(c, t, 140, 0.4, 0.22, 'sawtooth', 90); soplo(c, t, 0.25, 0.2, 400, 0.7, 'lowpass'); };
  // Reja contra la cadena: golpe sordo + eslabones metálicos
  sfx.cadena = (k = 1) => {
    const c = ctx(); if (!c) return; const t = c.currentTime + 0.005, v = Math.min(1.6, 0.7 + k * 0.2);
    tono(c, t, 95, 0.35, 0.5 * v, 'sine', 60); soplo(c, t, 0.18, 0.3 * v, 900, 0.8, 'lowpass');
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) { const ti = t + 0.02 + Math.random() * 0.45 * (i / n + 0.2), f = 1700 + Math.random() * 2600; tono(c, ti, f, 0.09 + Math.random() * 0.12, (0.05 + Math.random() * 0.07) * v, 'triangle'); tono(c, ti, f * 2.76, 0.06, 0.02 * v); }
  };
  const salida = (c, nodo, pan) => {
    if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); nodo.connect(p).connect(c.destination); }
    else nodo.connect(c.destination);
  };
  // Maullido: diente de sierra con un formante que se abre y se cierra ("mi-a-u")
  sfx.miau = (vol = 1, tono = 1, pan = 0) => {
    const c = ctx(); if (!c || vol <= 0.02) return; const t = c.currentTime + 0.01, F = 560 * tono, L = 0.5 + Math.random() * 0.25;
    const o = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(F * 0.82, t); o.frequency.linearRampToValueAtTime(F * 1.25, t + L * 0.25);
    o.frequency.linearRampToValueAtTime(F * 0.95, t + L * 0.7); o.frequency.linearRampToValueAtTime(F * 0.7, t + L);
    f1.type = 'bandpass'; f1.Q.value = 4.5; f1.frequency.setValueAtTime(850, t); f1.frequency.linearRampToValueAtTime(1750, t + L * 0.3); f1.frequency.linearRampToValueAtTime(950, t + L * 0.9);
    f2.type = 'lowpass'; f2.frequency.value = 3400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.06);
    g.gain.linearRampToValueAtTime(0.4 * vol, t + L * 0.65); g.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.05);
    o.connect(f1).connect(f2).connect(g); salida(c, g, pan); o.start(t); o.stop(t + L + 0.1);
  };
  // Graznido de cuervo: dos "cra" ásperos (diente de sierra que cae, formante nasal y un poco de ruido)
  sfx.graznido = (vol = 1, pan = 0) => {
    const c = ctx(); if (!c || vol <= 0.02) return; const t0 = c.currentTime + 0.01;
    [0, 0.34].forEach((dt, i) => {
      const t = t0 + dt, L = 0.26 - i * 0.03, F = 520 - i * 40;
      const o = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(F * 1.15, t); o.frequency.exponentialRampToValueAtTime(F * 0.62, t + L);
      f1.type = 'bandpass'; f1.Q.value = 3; f1.frequency.setValueAtTime(1400, t); f1.frequency.linearRampToValueAtTime(950, t + L);
      f2.type = 'lowpass'; f2.frequency.value = 2600;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + L);
      o.connect(f1).connect(f2).connect(g); salida(c, g, pan); o.start(t); o.stop(t + L + 0.05);
      const n = c.createBufferSource(), nf = c.createBiquadFilter(), ng = c.createGain(); n.buffer = buffRuido(c); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 1.4;
      ng.gain.setValueAtTime(0.12 * vol, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + L * 0.8); n.connect(nf).connect(ng); salida(c, ng, pan); n.start(t); n.stop(t + L);
    });
  };
  // Susto: siseo fuerte, chillido que cae y un golpe grave
  sfx.susto = () => {
    const c = ctx(); if (!c) return; const t = c.currentTime + 0.005;
    soplo(c, t, 0.75, 0.8, 3000, 0.7); soplo(c, t, 0.35, 0.5, 900, 0.8, 'lowpass');
    tono(c, t, 950, 0.65, 0.32, 'sawtooth', 300); tono(c, t + 0.015, 1420, 0.5, 0.16, 'square', 480);
    tono(c, t, 75, 0.55, 0.7, 'sine', 38);
  };
  // Cumbia original para el baile (guacharaca, bombo, tarola, campana y bajo); sin melodía de ninguna canción
  let cumbiaOut = null;
  sfx.cumbia = (dur = 13, bpm = 104) => {
    const c = ctx(); if (!c) return; sfx.cumbiaParar();
    const out = cumbiaOut = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    const b = 60 / bpm, t0 = c.currentTime + 0.05, n = Math.floor(dur / b), BAJO = [110, 165, 147, 131];
    const nota = (t, fr, du, vo, tipo = 'sine', f2) => { const o = c.createOscillator(), g = c.createGain(); o.type = tipo; o.frequency.setValueAtTime(fr, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + du); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vo, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + du); o.connect(g).connect(out); o.start(t); o.stop(t + du + 0.02); };
    const ras = (t, du, vo, fr) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = buffRuido(c); fl.type = 'bandpass'; fl.frequency.value = fr; fl.Q.value = 1.6; g.gain.setValueAtTime(vo, t); g.gain.exponentialRampToValueAtTime(0.0001, t + du); s.connect(fl).connect(g).connect(out); s.start(t); s.stop(t + du + 0.02); };
    for (let i = 0; i < n; i++) {
      const t = t0 + i * b, fin = Math.min(1, (n - i) / 4);
      ras(t, 0.13, 0.16 * fin, 4600); ras(t + b / 2, 0.06, 0.1 * fin, 5400); ras(t + b * 0.75, 0.05, 0.08 * fin, 5400);
      if (i % 2 === 0) { nota(t, 85, 0.2, 0.45 * fin, 'sine', 45); nota(t, BAJO[(i / 2) % 4], b * 0.9, 0.22 * fin, 'triangle'); }
      else { ras(t, 0.1, 0.2 * fin, 1900); nota(t + b / 2, 920, 0.07, 0.05 * fin, 'square'); nota(t + b / 2, BAJO[((i - 1) / 2) % 4] * 1.5, b * 0.4, 0.12 * fin, 'triangle'); }
    }
  };
  sfx.cumbiaParar = () => { if (!cumbiaOut) return; const c = ctx(); try { cumbiaOut.gain.setTargetAtTime(0, c.currentTime, 0.08); const o = cumbiaOut; setTimeout(() => o.disconnect(), 600); } catch (_) {} cumbiaOut = null; };
  // Caja de música: púas metálicas (seno + armónicos que se apagan rápido), frase original de 8 notas
  const CAJA = [659, 784, 988, 880, 784, 659, 587, 659, 523, 587, 659, 784, 740, 659, 587, 494];
  sfx.cajita = (vol = 1, pan = 0, n = 8) => {
    const c = ctx(); if (!c || vol <= 0.02) return; const t0 = c.currentTime + 0.02, out = c.createGain(); out.gain.value = vol; salida(c, out, pan);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.34 + (i % 2 ? 0.025 : 0), f = CAJA[i % CAJA.length];
      [[1, 0.15], [2.01, 0.045], [3.98, 0.02]].forEach(([k, a]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * k;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 / k + 0.25);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.3);
      });
    }
  };
  // Trueno: chasquido seco y un retumbo grave que se arrastra
  sfx.trueno = () => {
    const c = ctx(); if (!c) return; const t = c.currentTime + 0.01;
    soplo(c, t, 0.22, 0.9, 2400, 0.5, 'highpass'); soplo(c, t + 0.02, 0.4, 0.6, 700, 0.6, 'lowpass');
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = buffRuido(c); n.loop = true; f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(110, t + 3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.08); g.gain.exponentialRampToValueAtTime(0.32, t + 0.9);
    g.gain.linearRampToValueAtTime(0.5, t + 1.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    n.connect(f).connect(g).connect(c.destination); n.start(t); n.stop(t + 3.7);
    tono(c, t, 58, 2.4, 0.35, 'sine', 30);
  };
  // Cerillo: raspón corto y la llama que prende
  sfx.cerillo = () => {
    const c = ctx(); if (!c) return; const t = c.currentTime + 0.005;
    soplo(c, t, 0.08, 0.35, 3300, 1.6); soplo(c, t + 0.05, 0.07, 0.22, 2300, 1.2);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buffRuido(c); s.loop = true; f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t + 0.1); f.frequency.linearRampToValueAtTime(1400, t + 0.3); f.frequency.linearRampToValueAtTime(600, t + 0.7);
    g.gain.setValueAtTime(0.0001, t + 0.1); g.gain.exponentialRampToValueAtTime(0.22, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    s.connect(f).connect(g).connect(c.destination); s.start(t + 0.1); s.stop(t + 0.8);
  };
  // Ronroneo: ruido grave pulsado a ~24 Hz, con una respiración lenta
  sfx.ronroneo = (vol = 1, pan = 0) => {
    const c = ctx(); if (!c || vol <= 0.02) return; const t = c.currentTime + 0.01, L = 2.4;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    s.buffer = buffRuido(c); s.loop = true; f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.9;
    am.gain.value = 0.5; lfo.type = 'triangle'; lfo.frequency.value = 24; lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * vol, t + 0.3); g.gain.linearRampToValueAtTime(0.35 * vol, t + 1.1);
    g.gain.linearRampToValueAtTime(0.7 * vol, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + L);
    s.connect(f).connect(am).connect(g); salida(c, g, pan); s.start(t); lfo.start(t); s.stop(t + L + 0.05); lfo.stop(t + L + 0.05);
  };
  // Susurro: ruido filtrado que sube y se apaga
  sfx.susurro = (vol = 1, pan = 0) => {
    const c = ctx(); if (!c || vol <= 0.02) return; const t = c.currentTime + 0.01;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buffRuido(c); s.loop = true; f.type = 'bandpass'; f.Q.value = 2.6;
    f.frequency.setValueAtTime(1300, t); f.frequency.linearRampToValueAtTime(2600, t + 0.7); f.frequency.linearRampToValueAtTime(1700, t + 1.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    s.connect(f).connect(g); salida(c, g, pan); s.start(t); s.stop(t + 2);
  };
  // [Kura, founder 2026-10-02] Grabaciones CC0 de public/party/sfx (fuentes en su LICENSE.txt) en vez de la
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
}
