/**
 * The ambient drone of /party (gate and labyrinth): four low oscillators
 * through a slowly sweeping low-pass, quiet. Synthesized — there is no file.
 * Wire it while the context is still suspended; it sounds once a tap resumes
 * it. Returns a stop function.
 */

/*
 * Everything ambient (drone, organ) goes through ONE gain per context, so it
 * can be faded before the sound is cut. Suspending or tearing down a context
 * while a tone is mid-wave makes the speaker jump — the pop/chirp the founder
 * heard on the phone when leaving the page (2026-10-02).
 */
const buses = new WeakMap<AudioContext, GainNode>();
function bus(ctx: AudioContext): GainNode {
  let b = buses.get(ctx);
  if (!b) {
    b = ctx.createGain();
    b.connect(ctx.destination);
    buses.set(ctx, b);
  }
  return b;
}

/** Fade the ambience out (before suspending / leaving) or back in. ~50 ms: inaudible as a fade, enough to kill the pop. */
export function fadeAmbience(ctx: AudioContext, on: boolean) {
  if (ctx.state === "closed") return;
  const g = bus(ctx).gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.012);
}

/**
 * Bring the ambience in from silence over ~2 s — for a page reached from
 * another page of /party, so the drone swells back in instead of snapping on.
 */
export function swellAmbience(ctx: AudioContext) {
  if (ctx.state === "closed") return;
  const g = bus(ctx).gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(0, ctx.currentTime);
  g.setTargetAtTime(1, ctx.currentTime, 0.7);
}

/**
 * Make room for a special event's own sound (the cats' dance, the scare, the
 * thunder…): the ambience drops to `nivel` for `segundos`, then comes back —
 * smooth both ways. A new duck while one is running just extends it.
 */
const duckUntil = new WeakMap<AudioContext, number>();
export function duckAmbience(ctx: AudioContext, segundos: number, nivel = 0.18, reemplazar = false) {
  if (ctx.state === "closed" || !(segundos > 0)) return;
  // `reemplazar`: this duck sets the end on its own (the credits' song releases the ambience when it is dismissed)
  const g = bus(ctx).gain, now = ctx.currentTime, hasta = reemplazar ? now + segundos : Math.max(now + segundos, duckUntil.get(ctx) ?? 0);
  duckUntil.set(ctx, hasta);
  g.cancelScheduledValues(now);
  g.setTargetAtTime(nivel, now, 0.15);
  g.setTargetAtTime(1, hasta, 0.8);
}

/**
 * Pause/resume the context with the tab, fading first. Returns the listener's
 * cleanup. `muted` lets a caller veto the resume.
 */
export function pauseAmbienceWhenHidden(getCtx: () => AudioContext | null | undefined): () => void {
  // Coming back to Safari (founder, 2026-10-02): iOS leaves the context suspended or "interrupted" and won't
  // resume it outside a tap — trying on return isn't enough. So the page shows a "Pausa" screen: the tap that
  // dismisses it is the gesture that brings the sound back. `sonaba` = there was sound before leaving (never
  // ask for a tap the visitor hadn't given yet).
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sonaba = false;
  let capa: HTMLDivElement | null = null;
  const traerDeVuelta = () => {
    const ctx = getCtx();
    if (!ctx || ctx.state === "closed") return;
    fadeAmbience(ctx, true);
    if (ctx.state !== "running") ctx.resume().then(() => fadeAmbience(ctx, true)).catch(() => {});
  };
  const quitarPausa = (e?: Event) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    traerDeVuelta(); // inside the tap: iOS lets it play
    capa?.remove();
    capa = null;
  };
  const mostrarPausa = () => {
    if (capa) return;
    const tactil = matchMedia("(pointer:coarse)").matches;
    capa = document.createElement("div");
    capa.setAttribute("role", "button");
    capa.setAttribute("tabindex", "0");
    capa.setAttribute("aria-label", "Pausa. " + (tactil ? "Toca" : "Haz clic") + " para continuar.");
    capa.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;align-content:center;gap:14px;padding:24px;" +
      "background:rgba(4,4,6,.84);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);cursor:pointer;" +
      "text-align:center;-webkit-tap-highlight-color:transparent;outline:none";
    const t = document.createElement("p");
    t.textContent = "Pausa";
    t.style.cssText =
      'margin:0;font:400 clamp(40px,8vw,64px)/1 "Creepster",var(--pl-creep),system-ui,sans-serif;letter-spacing:.04em;' +
      "text-transform:uppercase;color:#9e3b30;text-shadow:0 0 18px rgba(0,0,0,.75)";
    const d = document.createElement("p");
    d.textContent = (tactil ? "Toca" : "Haz clic") + " para continuar";
    d.style.cssText =
      'margin:0;font:500 15px/1.3 "Oswald",var(--pl-oswald),system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#ddd7ca';
    capa.append(t, d);
    capa.addEventListener("click", quitarPausa);
    capa.addEventListener("touchend", quitarPausa);
    capa.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") quitarPausa(e);
    });
    document.body.appendChild(capa);
    capa.focus({ preventScroll: true });
  };
  const onVisibility = () => {
    const ctx = getCtx();
    if (!ctx || ctx.state === "closed") return;
    clearTimeout(timer);
    if (document.hidden) {
      // "interrupted" (Safari) also means it was playing: iOS got there first.
      if (ctx.state !== "suspended") sonaba = true;
      if (!sonaba) return;
      fadeAmbience(ctx, false);
      timer = setTimeout(() => ctx.suspend().catch(() => {}), 70);
    } else if (sonaba) {
      mostrarPausa();
    }
  };
  // Leaving for good (closing the tab, navigating away): there is no time to suspend, only to fade.
  const onPageHide = () => {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state !== "suspended") sonaba = true;
    fadeAmbience(ctx, false);
  };
  // Back from the page cache: same pause screen.
  const onPageShow = (e: PageTransitionEvent) => {
    if (document.hidden || !sonaba || !e.persisted) return;
    mostrarPausa();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    clearTimeout(timer);
    capa?.remove();
    capa = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
}

export function startDrone(ctx: AudioContext): () => void {
  const g = ctx.createGain();
  g.gain.value = 0.07;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  const oscs = [55, 55.6, 82.4, 110.3].map((f, k) => {
    const o = ctx.createOscillator();
    o.type = k % 2 ? "sawtooth" : "triangle";
    o.frequency.value = f;
    o.connect(lp);
    o.start();
    return o;
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lg = ctx.createGain();
  lg.gain.value = 220;
  lfo.connect(lg);
  lg.connect(lp.frequency);
  lfo.start();
  lp.connect(g);
  g.connect(bus(ctx));
  return () => {
    try {
      [...oscs, lfo].forEach((o) => o.stop());
      g.disconnect();
    } catch {}
  };
}

/**
 * The labyrinth's organ (founder, 2026-10-02): slow chords in A minor — the
 * drone sits on A and E — that swell in, hold and fade, with long silences in
 * between and now and then a single high note over them. Synthesized like the
 * drone (drawbar-style partials per note, a tremulant, a feedback delay for
 * the room); there is no file. Returns a stop function.
 */
export function startOrgan(ctx: AudioContext): () => void {
  const out = ctx.createGain();
  out.gain.value = 0.12; // founder, by ear: at 0.055 the drone covered it
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1700;
  // Tremulant: the pipe organ's slow wobble.
  const trem = ctx.createGain();
  trem.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.value = 0.07;
  lfo.connect(depth);
  depth.connect(trem.gain);
  lfo.start();
  // The room: one long echo fed back on itself.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.37;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  tone.connect(trem);
  trem.connect(out);
  trem.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(out);
  out.connect(bus(ctx));

  // Partials of one stop: sub-octave, unison, octave, twelfth, fifteenth.
  const STOPS: [number, number][] = [[0.5, 0.45], [1, 1], [2, 0.5], [3, 0.22], [4, 0.14]];
  const note = (f: number, at: number, dur: number, vol: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 1.4);
    g.gain.setValueAtTime(vol, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 2.6);
    g.connect(tone);
    STOPS.forEach(([k, a]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = f * k;
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(at);
      o.stop(at + dur + 2.8);
    });
  };
  // A minor, around the drone's A: Am · Dm · F · E · Am/C (frequencies in Hz).
  const A2 = 110, C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, GS3 = 207.65, A3 = 220, B3 = 246.94, C4 = 261.63, D4 = 293.66, E4 = 329.63;
  const CHORDS = [
    [A2, C3, E3, A3],
    [D3, F3, A3, D4],
    [F3, A3, C4],
    [E3, GS3, B3, E4],
    [C3, E3, A3, C4],
  ];
  const HIGH = [440, 523.25, 587.33, 659.25, 783.99];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = -1;
  const next = () => {
    // A suspended context (hidden tab) has a frozen clock: wait instead of piling notes on it.
    if (ctx.state !== "running") {
      timer = setTimeout(next, 1000);
      return;
    }
    let i = Math.floor(Math.random() * CHORDS.length);
    if (i === last) i = (i + 1) % CHORDS.length;
    last = i;
    const at = ctx.currentTime + 0.1;
    const dur = 5 + Math.random() * 4;
    CHORDS[i].forEach((f, k) => note(f, at + k * 0.18, dur, 0.22));
    if (Math.random() < 0.45) note(HIGH[Math.floor(Math.random() * HIGH.length)], at + 2 + Math.random() * 2, 2.5, 0.09);
    timer = setTimeout(next, (dur + 6 + Math.random() * 9) * 1000);
  };
  timer = setTimeout(next, 4000);
  return () => {
    clearTimeout(timer);
    try {
      lfo.stop();
      out.disconnect();
    } catch {}
  };
}
