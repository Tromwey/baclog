/**
 * The app's motion physics — a closed-form damped spring plus the two gesture
 * helpers that go with it (momentum projection, rubber-banding). No library:
 * this is ~100 lines, and every gesture-driven surface (the <Sheet>, the
 * search sheet) shares it.
 *
 * Parameters are Apple's designer-facing pair, not mass/stiffness/damping:
 *  - `damping`  — damping RATIO. 1 = critically damped (no overshoot, the
 *    default for anything that just appears); ~0.8 = a little bounce, reserved
 *    for motion that a gesture threw (a flicked sheet settling back).
 *  - `response` — seconds-ish to reach the target. NOT a duration: a spring has
 *    none; settle time emerges from the pair.
 *
 * Why a spring and not a CSS transition: it starts from the CURRENT value with
 * the CURRENT velocity, so it can be grabbed mid-flight and re-targeted with no
 * jump and no velocity "brick wall" — which is what interruptible UI needs.
 */

export interface SpringOptions {
  from: number;
  to: number;
  /** Initial velocity in units/second (px/s for positions). */
  velocity?: number;
  damping?: number;
  response?: number;
  /** |value − to| under this (and a matching velocity) counts as at rest. */
  precision?: number;
  onUpdate: (value: number) => void;
  onRest?: () => void;
}

export interface SpringHandle {
  /** Halts the spring where it is. `onRest` does NOT fire. */
  stop: () => void;
  /** Live presentation value — what a re-target/interrupt must start from. */
  value: () => number;
  /** Live velocity in units/second — hand it to the next spring. */
  velocity: () => number;
}

export function spring({
  from,
  to,
  velocity = 0,
  damping = 1,
  response = 0.35,
  precision = 0.5,
  onUpdate,
  onRest,
}: SpringOptions): SpringHandle {
  const omega = (2 * Math.PI) / response; // undamped angular frequency
  const zeta = Math.min(damping, 1); // over-damped is never wanted in UI
  const x0 = from - to;
  const start = performance.now();
  let value = from;
  let vel = velocity;
  let raf = 0;
  let done = false;

  // Closed-form solution, so a dropped frame never destabilizes the motion
  // (a stepped integrator would overshoot on a long frame).
  const sample = (t: number) => {
    if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const a = x0;
      const b = (velocity + zeta * omega * x0) / wd;
      const decay = Math.exp(-zeta * omega * t);
      const cos = Math.cos(wd * t);
      const sin = Math.sin(wd * t);
      value = to + decay * (a * cos + b * sin);
      vel =
        decay *
        ((b * wd - zeta * omega * a) * cos - (a * wd + zeta * omega * b) * sin);
    } else {
      const c = velocity + omega * x0;
      const decay = Math.exp(-omega * t);
      value = to + (x0 + c * t) * decay;
      vel = (c - omega * (x0 + c * t)) * decay;
    }
  };

  const tick = (now: number) => {
    if (done) return;
    sample(Math.max(0, now - start) / 1000);
    // Velocity threshold scales with precision: 0.5px ↔ 5px/s, 0.005 ↔ 0.05/s.
    if (Math.abs(value - to) < precision && Math.abs(vel) < precision * 10) {
      done = true;
      value = to;
      vel = 0;
      onUpdate(to);
      onRest?.();
      return;
    }
    onUpdate(value);
    raf = requestAnimationFrame(tick);
  };
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    // A hidden tab gets no animation frames, so `onRest` — which callers use
    // to unmount things — would wait until the tab is shown again. Nobody is
    // watching: land now.
    done = true;
    value = to;
    vel = 0;
    queueMicrotask(() => {
      onUpdate(to);
      onRest?.();
    });
  } else {
    raf = requestAnimationFrame(tick);
  }

  return {
    stop: () => {
      done = true;
      cancelAnimationFrame(raf);
    },
    value: () => value,
    velocity: () => vel,
  };
}

/**
 * Where a release at `velocity` (px/s) would coast to — the exponential-decay
 * form scroll views use, NOT v²/2a. Pick a snap target from
 * `position + project(v)`, never from the release point: that's what makes a
 * short flick throw the sheet away.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Soft boundary: the further past the edge, the less the element follows.
 * `dimension` is the size of the thing being dragged (or the viewport).
 */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/**
 * The inverse of `rubberband`: the raw travel that produced an on-screen,
 * rubber-banded offset. A gesture that grabs something mid-bounce must start
 * from THIS, not from the visible offset — feeding the visible value back
 * through `rubberband` resists twice and the element jumps toward rest.
 */
export function unrubberband(
  offset: number,
  dimension: number,
  constant = 0.55,
): number {
  if (offset === 0) return 0;
  // offset = r·d·c / (d + c·|r|)  →  |r| = |offset|·d / (c·(d − |offset|))
  const room = dimension - Math.abs(offset);
  if (room <= 0) return offset; // at/over the asymptote: nothing to invert
  return (offset * dimension) / (constant * room);
}

/**
 * Release velocity from the last ~100ms of pointer samples. The final
 * pointermove alone is noise (a finger decelerates as it lifts), and a sample
 * from a pause half a second ago says nothing about the throw.
 */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  add(value: number, time: number) {
    this.samples.push({ t: time, v: value });
    while (this.samples.length > 2 && time - this.samples[0].t > 100) {
      this.samples.shift();
    }
  }

  reset() {
    this.samples = [];
  }

  /** Units per second, as of `now` — a finger that stopped before lifting
   *  (no sample in the last 80ms) releases at rest, whatever it did earlier. */
  get(now: number): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t < 1) return 0;
    if (now - last.t > 80) return 0;
    return ((last.v - first.v) / (last.t - first.t)) * 1000;
  }
}
