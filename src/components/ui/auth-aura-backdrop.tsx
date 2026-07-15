"use client";

import { AuraField, LIMA } from "./aura-field";

// No signed-in user on the auth screens → a fixed brand ADN set. There's no
// real content to evolve with here, so lima is included explicitly (AuraField
// no longer auto-injects it — F3.6.1, content-driven auras only). Defined
// once, shared by login/verify/onboarding.
export const AUTH_ADN = [
  LIMA,
  "#C7462F",
  "#3A5A9B",
  "#9B4DCA",
  "#E8B23A",
  "#7AA2FF",
];

// The shared aura + radial-fade overlay behind the auth screens. Only the
// per-screen `seed` varies (login=21, verify=34, onboarding=47).
export function AuthAuraBackdrop({ seed }: { seed: number }) {
  return (
    <>
      <AuraField
        variant="ambient"
        colors={AUTH_ADN}
        seed={seed}
        className="!opacity-[0.5]"
      />
      {/* Scrim the copy/form band for legibility as a smooth wash — no flat
          plateau feeding into a sudden ramp (that slope discontinuity reads
          as a hard seam, worst right behind the status bar) and no literal
          `transparent` keyword (rgba(0,0,0,0) interpolated toward an opaque
          color leaves a muddy fringe — same pitfall AuraField's own ellipses
          document avoiding). Every stop is the same rgb, alpha-only ramp. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(11,11,13,0) 0%, rgba(11,11,13,0.08) 10%, rgba(11,11,13,0.22) 20%, rgba(11,11,13,0.55) 32%, rgba(11,11,13,0.55) 60%, rgba(11,11,13,0.22) 74%, rgba(11,11,13,0.08) 84%, rgba(11,11,13,0) 96%)",
        }}
      />
    </>
  );
}
