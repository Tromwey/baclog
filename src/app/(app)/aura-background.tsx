"use client";

import { usePathname } from "next/navigation";
import { AuraField } from "@/components/ui";

/**
 * The persistent app-wide ADN aura (M3.5). It lives in the (app) layout — NOT
 * per page — so it stays put across navigations; only the page content/text
 * transitions over it. Its reach is route-controlled: on /descubrir it bleeds
 * to mid-screen (fade off); everywhere else a fade cuts it just below the
 * header. Colors = lima + the user's extracted palette.
 */
export function AuraBackground({ colors }: { colors: string[] }) {
  const pathname = usePathname();
  const isDescubrir = pathname.startsWith("/descubrir");

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-0 z-0 h-[480px] w-full max-w-md -translate-x-1/2"
    >
      <AuraField
        variant="ambient"
        colors={colors}
        seed={7}
        className="!opacity-[0.55]"
      />
      {/* Base fade of the aura into the background. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 24%, rgba(11,11,13,0.42) 52%, #0B0B0D 82%)",
        }}
      />
      {/* Route fade — on non-Descubrir pages this cuts the aura right below the
          header; it transitions on navigation so pages cross-fade the reach.
          Slow, symmetric easeInOutSine so the aura breathes in/out organically
          instead of wiping. */}
      <div
        className="absolute inset-0 transition-opacity duration-[900ms]"
        style={{
          background:
            "linear-gradient(180deg, transparent 92px, rgba(11,11,13,0.55) 158px, #0B0B0D 222px)",
          opacity: isDescubrir ? 0 : 1,
          transitionTimingFunction: "cubic-bezier(0.37, 0, 0.63, 1)",
        }}
      />
    </div>
  );
}
