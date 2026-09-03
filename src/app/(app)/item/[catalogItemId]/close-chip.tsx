"use client";

import { useRouter } from "next/navigation";
import { glassChipClass } from "@/components/ui/glass";
import { StrokeIcon } from "@/components/ui/stroke-icon";
import { BACK_PATH } from "@/components/glyph-paths";

/**
 * The hero's back chip (Revamp UI 06) — the shared 38px glass chip recipe with
 * the mock's ‹ glyph (16px, stroke 2.4), i.e. exactly what BackButton draws.
 * It is its own component for one reason: router.back() like BackButton, but
 * the item detail HIDES the dock, so a deep-linked visit with no in-app
 * history would leave the chip doing nothing with no other way out — it falls
 * back to /backlogs instead.
 */
export function BackChip() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/backlogs");
      }}
      aria-label="Volver"
      className={glassChipClass}
    >
      <StrokeIcon d={BACK_PATH} size={16} strokeWidth={2.4} />
    </button>
  );
}
