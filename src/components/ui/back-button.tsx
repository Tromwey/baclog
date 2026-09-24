"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACK_PATH } from "@/components/glyph-paths";
import { CHIP_44 } from "@/components/kura/components";
import { StrokeIcon } from "./stroke-icon";

// Kura (§componentes, 2026-09-24): Volver is the 44 glass chip with the
// 18 / 2.2 chevron everywhere. The 38 recipe (glass.ts) stays for other chips.
const CHIP = CHIP_44;

/**
 * Circular glass back control — the app's ONE back affordance.
 *
 * Default: router.back(), so it returns to wherever the user came from (search,
 * a backlog zoom, a reco); on a deep link with no history the nav dock (always
 * visible in-app) is the fallback.
 *
 * Pass `href` on the DOCK-LESS public `/u/*` surfaces, where router.back() has
 * no dock to fall back to: it renders a Link to a deterministic destination so
 * a cold deep-link still navigates somewhere sensible. Same chip either way, so
 * the public pages match the rest of the app instead of a bespoke text link.
 */
export function BackButton({
  href,
  className = "",
}: {
  href?: string;
  className?: string;
}) {
  const router = useRouter();
  const icon = <StrokeIcon d={BACK_PATH} size={18} strokeWidth={2.2} />;
  if (href) {
    return (
      <Link href={href} aria-label="Volver" className={`${CHIP} ${className}`}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
      className={`${CHIP} ${className}`}
    >
      {icon}
    </button>
  );
}
