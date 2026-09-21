/**
 * Guardrail for the motion physics (src/lib/spring.ts). Run:
 * `pnpm tsx scripts/check-spring.ts` — exits 1 on the first failed
 * expectation. Pure module; the frame clock is faked here (no browser).
 *
 * What this guards — the properties the sheets' FEEL depends on, which a
 * "harmless" tweak to the math would break without any type error:
 *  - a critically damped spring never overshoots (a sheet that just appears
 *    must not bounce);
 *  - a thrown spring keeps the gesture's velocity on its first frame (no seam
 *    between dragging and animating), and an interrupted one reports the live
 *    value + velocity a re-target has to start from;
 *  - `onRest` fires exactly once and `stop()` silences it (callers unmount in
 *    `onRest`);
 *  - projection is Apple's exponential-decay form, rubber-banding is monotonic
 *    and bounded, and a finger that paused before lifting releases at rest.
 */
import assert from "node:assert/strict";

// --- A fake display: frames advance only when `step` says so.
let now = 0;
let queue: ((t: number) => void)[] = [];
const g = globalThis as unknown as Record<string, unknown>;
g.requestAnimationFrame = (cb: (t: number) => void) => {
  queue.push(cb);
  return queue.length;
};
g.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, "performance", {
  value: { now: () => now },
  configurable: true,
});
function step(ms: number, frames: number) {
  for (let i = 0; i < frames; i++) {
    now += ms;
    const run = queue;
    queue = [];
    run.forEach((cb) => cb(now));
  }
}

async function main() {
  const { VelocityTracker, project, rubberband, spring } = await import(
    "../src/lib/spring"
  );

  // --- Critically damped: monotonic approach, never past the target.
  {
    const seen: number[] = [];
    let rests = 0;
    spring({ from: 0, to: 100, onUpdate: (v) => seen.push(v), onRest: () => rests++ });
    step(16, 120);
    assert.equal(rests, 1, "onRest fires exactly once");
    assert.equal(seen[seen.length - 1], 100, "lands exactly on the target");
    assert.ok(Math.max(...seen) <= 100, "damping 1 must not overshoot");
    for (let i = 1; i < seen.length; i++) {
      assert.ok(seen[i] >= seen[i - 1], "damping 1 must approach monotonically");
    }
  }

  // --- Under-damped (a thrown sheet settling back): overshoots a little, and
  //     only a little.
  {
    const seen: number[] = [];
    spring({ from: 100, to: 0, damping: 0.8, response: 0.3, onUpdate: (v) => seen.push(v) });
    step(16, 120);
    const min = Math.min(...seen);
    assert.ok(min < 0, "damping 0.8 should overshoot");
    assert.ok(min > -5, "…by a few percent, not a wobble");
    assert.equal(seen[seen.length - 1], 0);
  }

  // --- Velocity handoff: the first frame moves at the gesture's speed.
  {
    const seen: number[] = [];
    spring({ from: 0, to: 400, velocity: 2000, onUpdate: (v) => seen.push(v) });
    step(1, 1);
    // 1ms at 2000px/s ≈ 2px (the spring's own pull adds a hair).
    assert.ok(seen[0] > 1.9 && seen[0] < 2.3, `first-frame travel was ${seen[0]}`);
  }

  // --- Interrupt: live value/velocity are readable, stop() silences onRest.
  {
    let rests = 0;
    const h = spring({ from: 0, to: 100, onUpdate: () => {}, onRest: () => rests++ });
    step(16, 5);
    assert.ok(h.value() > 0 && h.value() < 100, "mid-flight value is live");
    assert.ok(h.velocity() > 0, "mid-flight velocity is live");
    h.stop();
    step(16, 120);
    assert.equal(rests, 0, "a stopped spring never reports rest");
  }

  // --- Projection: the exponential-decay form (NOT v²/2a).
  assert.ok(Math.abs(project(1000) - 499) < 0.001);
  assert.ok(Math.abs(project(-1000) + 499) < 0.001);
  assert.equal(project(0), 0);

  // --- Rubber band: follows less and less, never reaches its asymptote, odd.
  {
    const d = 300;
    let prev = 0;
    for (let o = 10; o <= 2000; o += 10) {
      const r = rubberband(o, d);
      assert.ok(r > prev, "monotonic");
      assert.ok(r < o, "always resists");
      assert.ok(r < d, "bounded by the dimension");
      prev = r;
    }
    assert.equal(rubberband(-120, d), -rubberband(120, d));
  }

  // --- Release velocity: a steady drag reads its speed; a pause reads zero.
  {
    const t = new VelocityTracker();
    for (let i = 0; i <= 10; i++) t.add(i * 8, i * 16); // 8px / 16ms = 500px/s
    assert.ok(Math.abs(t.get(160) - 500) < 1);
    assert.equal(t.get(160 + 200), 0, "paused before lifting → at rest");
    t.reset();
    assert.equal(t.get(0), 0);
  }

  console.log("check-spring: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
