/*
 * Sound effects for /party. Real recordings where we have them — all CC0:
 * Kenney's "Impact Sounds" + "RPG Audio", and from Freesound (see LICENSE.txt) a real chain
 * (nettimato), a church bell (Audeption), an iron gate (qubodup) and the
 * jumpscare screech ("Jumpscare Sound 2", Kierham), trimmed
 * into /public/party/sfx (sources in its LICENSE.txt),
 * several variants per sound, picked at random and pitch-jittered so repeats
 * don't sound canned — and WebAudio synthesis as the fallback while they load
 * (or if one fails) and for the cauldron bubbles. They ride
 * the SAME AudioContext as the ambient drone (PartyInvitation.startAudio), so
 * "SONIDO OFF" silences them too: the invitation registers the context while
 * sound is on and clears it when it's off; every effect no-ops without it.
 */

let ctx: AudioContext | null = null;

/** Sample name → variant count in /public/party/sfx/{name}-{i}.m4a */
const SAMPLES = {
  scream: 1, chain: 8, bell: 1, toll: 1, gateswing: 1, gateclang: 1, gatelock: 1,
  gate: 5, link: 5, stone: 5, thud: 3, tink: 3, flip: 3, latch: 2, creak: 2,
  fire: 1, click: 1, static: 1, scurry: 1,
} as const;
type SampleName = keyof typeof SAMPLES;
const buffers: Partial<Record<SampleName, AudioBuffer[]>> = {};
let loadingFor: AudioContext | null = null;

/** Decode every sample once. AudioBuffers aren't tied to a context, so a new
 *  context (remount) only fetches what isn't loaded yet. */
function loadSamples(c: AudioContext) {
  if (loadingFor === c) return;
  loadingFor = c;
  for (const [name, n] of Object.entries(SAMPLES) as [SampleName, number][]) {
    if ((buffers[name]?.length ?? 0) >= n) continue;
    buffers[name] = [];
    for (let i = 0; i < n; i++) {
      fetch(`/party/sfx/${name}-${i}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((b) => c.decodeAudioData(b))
        .then((buf) => {
          (buffers[name] ??= []).push(buf);
        })
        .catch(() => {}); // the synthesized fallback covers a missing file
    }
  }
}

export function setSfxContext(c: AudioContext | null) {
  ctx = c;
  if (c) loadSamples(c);
}

/** Play one random variant of a recording. False if not loaded (caller falls back to synthesis). */
function sample(name: SampleName, vol: number, delay = 0, rate = 1): boolean {
  const list = buffers[name];
  if (!list?.length) return false;
  const o = out(vol);
  if (!o) return true; // sound is off: nothing to fall back to either
  const src = o.c.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.08);
  src.connect(o.g);
  src.start(o.t + delay);
  return true;
}

function out(gain: number) {
  if (!ctx || ctx.state !== "running") return null;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  return { c: ctx, g, t: ctx.currentTime };
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", glideTo?: number, delay = 0) {
  const o = out(0);
  if (!o) return;
  const { c, g } = o;
  const t = o.t + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, freqTo?: number, delay = 0) {
  const o = out(0);
  if (!o) return;
  const { c, g } = o;
  const t = o.t + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  src.start(t);
}

/**
 * A struck piece of metal. What makes it read as METAL (and not as filtered
 * noise) is the inharmonic partial series — overtones that aren't integer
 * multiples, like a small bell — each decaying faster the higher it is, plus
 * a click of a transient on top.
 */
const METAL_RATIOS = [1, 1.52, 2.07, 2.71, 3.33, 4.18];
const METAL_AMPS = [1, 0.62, 0.48, 0.3, 0.2, 0.12];
function metalHit(freq: number, dur: number, vol: number, delay = 0) {
  const o = out(1);
  if (!o) return;
  const { c, g } = o;
  const t = o.t + delay;
  METAL_RATIOS.forEach((r, k) => {
    const osc = c.createOscillator();
    const pg = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * r * (1 + (Math.random() - 0.5) * 0.01), t);
    const d = dur / (1 + k * 0.55);
    pg.gain.setValueAtTime(0.0001, t);
    pg.gain.exponentialRampToValueAtTime(vol * METAL_AMPS[k], t + 0.002);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(pg);
    pg.connect(g);
    osc.start(t);
    osc.stop(t + d + 0.02);
  });
  noise(0.012, vol * 0.8, "highpass", 5000, undefined, delay);
}

export const sfx = {
  /** Clock hit: a church bell (inharmonic partials, long tail). */
  bell() {
    if (sample("bell", 0.85)) return;
    [[220, 0.35], [440, 0.22], [587, 0.12], [880, 0.08], [1180, 0.05]].forEach(([f, v]) => tone(f, 2.4, v, "sine"));
  },
  /** Midnight: the bell tolls three times (the clock game's final hit). */
  toll() {
    if (sample("toll", 0.9)) return;
    sfx.bell();
  },
  /** A miss / wrong answer: a dull low thud. */
  thud() {
    if (sample("thud", 0.8)) return;
    tone(110, 0.35, 0.4, "sine", 50);
    noise(0.12, 0.15, "lowpass", 400);
  },
  /** Stone piece turning (map). */
  scrape() {
    if (sample("stone", 0.45, 0, 1.25)) return;
    noise(0.18, 0.18, "bandpass", 900, 500);
  },
  /** Cauldron bubble, pitched per ingredient. */
  bubble(k = 0) {
    const base = [260, 330, 390, 470][k % 4];
    tone(base, 0.16, 0.25, "sine", base * 1.9);
    tone(base * 1.5, 0.1, 0.1, "sine", base * 2.6, 0.06);
  },
  /** Card flip (masks). */
  flip() {
    if (sample("flip", 0.8)) return;
    noise(0.05, 0.2, "highpass", 2500);
  },
  /** A pair found / a correct step. */
  chime() {
    if (sample("tink", 0.6, 0, 1.2)) return;
    tone(660, 0.5, 0.18, "triangle");
    tone(990, 0.6, 0.12, "triangle", undefined, 0.08);
  },
  /** The cat's jumpscare: a harsh animatronic-style screech (recording), a synthesized hiss as fallback. */
  hiss() {
    if (sample("scream", 1)) return;
    noise(0.9, 0.8, "bandpass", 3200, 6500);
    tone(95, 0.8, 0.45, "sawtooth", 60);
    tone(1300, 0.45, 0.22, "sawtooth", 2800, 0.05);
  },
  /** Radio static (something in the fog): a recording, synthesized noise as fallback. */
  static() {
    if (sample("static", 0.5)) return;
    noise(0.5, 0.12, "bandpass", 2400, 1800);
    noise(0.35, 0.1, "highpass", 3000, undefined, 0.45);
    noise(0.6, 0.1, "bandpass", 1500, 2600, 0.8);
  },
  /** The lantern catching fire (the "bonfire"). */
  bonfire() {
    if (sample("fire", 0.8)) return;
    sfx.chime();
  },
  /** Something small bolting through the leaves (the eyes flee). */
  scurry() {
    if (sample("scurry", 0.7)) return;
    sfx.flip();
  },
  /** The flashlight's switch. False if the recording isn't loaded yet (the caller synthesizes it). */
  click(delay = 0): boolean {
    return sample("click", 0.9, delay);
  },
  /** The gate swinging open (entering the cemetery). */
  gateOpen() {
    if (sample("gatelock", 0.7)) {
      sample("gateswing", 0.9, 0.15);
      return;
    }
    sample("latch", 0.7);
    sample("creak", 0.8, 0.12, 0.85);
  },
  /** Chains shaken against iron bars (the locked gate): link clinks, the gate's iron clank, the padlock knocking. */
  rattle() {
    if (sample("chain", 0.9)) {
      // A real chain shaken, the iron gate knocking in its frame, the padlock swinging back.
      sample("gateclang", 0.45, 0.02, 1.05);
      sample("gatelock", 0.5, 0.3, 1.1);
      return;
    }
    if (sample("gate", 0.75)) {
      let t = 0.03;
      for (let i = 0; i < 12; i++) {
        sample("link", 0.25 + Math.random() * 0.25, t, 1.1 + Math.random() * 0.5);
        t += 0.025 + Math.random() * 0.035 + i * 0.005;
      }
      sample("latch", 0.7, 0.14);
      return;
    }
    // The gate itself: a low, long iron clank.
    metalHit(142, 1.4, 0.16);
    metalHit(213, 0.9, 0.08, 0.01);
    // Links: a burst that thins out, each clink pitched differently.
    let t = 0.02;
    for (let i = 0; i < 16; i++) {
      metalHit(1900 + Math.random() * 2600, 0.09 + Math.random() * 0.12, 0.05 + Math.random() * 0.05, t);
      t += 0.018 + Math.random() * 0.03 + i * 0.004;
    }
    // Padlock swinging back against the bars.
    metalHit(620, 0.35, 0.1, 0.12);
    metalHit(560, 0.3, 0.07, 0.34);
  },
  /** The seal breaks: stone crack + falling chain rattle + the candle catching. */
  unseal() {
    if (sample("stone", 1)) {
      // Stone cracks, the chains drop link by link, a last tink; then the candle catches.
      if (!sample("chain", 0.7, 0.2)) {
        for (let i = 0; i < 7; i++) sample("link", 0.35, 0.22 + i * 0.07 + Math.random() * 0.03, 0.9 + Math.random() * 0.4);
      }
      sample("tink", 0.4, 0.75, 0.8);
      noise(0.7, 0.18, "bandpass", 400, 2400, 0.6);
      return;
    }
    noise(0.35, 0.5, "lowpass", 1800, 300);
    tone(70, 0.5, 0.4, "sine", 40);
    for (let i = 0; i < 8; i++) metalHit(1800 + Math.random() * 2400, 0.12, 0.06, 0.25 + i * 0.06 + Math.random() * 0.02);
    noise(0.7, 0.2, "bandpass", 400, 2400, 0.55);
  },
};
