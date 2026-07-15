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
      {/* Scrim the copy/form band for legibility, but leave the top and
          bottom edges clear — a centered radial vignette dims edges
          monotonically outward, which was crushing the aura to near-black
          right behind the status bar. A vertical band keeps the dark scrim
          only where there's text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 12%, rgba(11,11,13,0.55) 28%, rgba(11,11,13,0.55) 64%, transparent 82%, transparent 100%)",
        }}
      />
    </>
  );
}
