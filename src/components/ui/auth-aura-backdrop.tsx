"use client";

import { AuraField } from "./aura-field";

// No signed-in user on the auth screens → a fixed brand ADN set
// (AuraField forces lima first). Defined once, shared by login/verify/onboarding.
export const AUTH_ADN = ["#C7462F", "#3A5A9B", "#9B4DCA", "#E8B23A", "#7AA2FF"];

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
      {/* Keep the form legible over the aura. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, transparent 0%, rgba(11,11,13,0.55) 62%, #0B0B0D 100%)",
        }}
      />
    </>
  );
}
