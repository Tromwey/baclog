"use client";

import { useRouter } from "next/navigation";
import { CHIP_44 } from "@/components/kura/components";
import { BACK_PATH } from "@/components/glyph-paths";

/**
 * Volver (§componentes · navegación): 44 px glass at 64/24, the ‹ at 18 with
 * stroke 2.2 — the Kura BackChip's look. A button, not the primitive's Link,
 * for one reason: router.back() returns to wherever the ficha was opened from,
 * and the ficha HIDES the dock, so a deep-linked visit with no in-app history
 * falls back to /backlogs instead of doing nothing.
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
      className={CHIP_44}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={BACK_PATH} />
      </svg>
    </button>
  );
}
