"use client";

import { useRouter } from "next/navigation";
import { BACK_PATH } from "@/components/glyph-paths";
import { StrokeIcon } from "@/components/ui/stroke-icon";
import { glassChipClass } from "@/components/ui/glass";

/**
 * Back control for the backlog detail and the lens heroes — the app's 38px
 * glass chip (Revamp UI 2026-09-03) with the mock's stroke chevron.
 * router.back() both dismisses the intercepted overlay (the modal opened by
 * pushing the URL) and pops the full page; for deep links with no history
 * the dock is the fallback.
 */
export function ZoomBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
      className={glassChipClass}
    >
      <StrokeIcon d={BACK_PATH} size={16} strokeWidth={2.4} />
    </button>
  );
}
