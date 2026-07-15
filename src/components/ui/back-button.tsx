"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

const CHIP =
  "flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.28] text-text backdrop-blur-[18px] transition-colors hover:bg-black/[0.4]";

/**
 * Circular glass back control (M3.5) — the app's ONE back affordance.
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
  if (href) {
    return (
      <Link href={href} aria-label="Volver" className={`${CHIP} ${className}`}>
        <ChevronLeft size={20} />
      </Link>
    );
  }
  return (
    <button
      onClick={() => router.back()}
      aria-label="Volver"
      className={`${CHIP} ${className}`}
    >
      <ChevronLeft size={20} />
    </button>
  );
}
