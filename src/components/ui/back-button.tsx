"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACK_PATH } from "@/components/glyph-paths";
import { StrokeIcon } from "./stroke-icon";

import { glassChipClass } from "./glass";

const CHIP = glassChipClass;

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
  const icon = <StrokeIcon d={BACK_PATH} size={16} strokeWidth={2.4} />;
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
