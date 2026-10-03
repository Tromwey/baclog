"use client";

import { useEffect, type CSSProperties } from "react";
import { CHIP_ART, GLASS_BUTTON } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { ZoomBackButton } from "../../../../backlogs/zoom-back-button";

/**
 * The collection overlay's own error boundary. Without it a read that threw
 * inside the intercepted collection climbed to `(app)/error.tsx` and replaced
 * the WHOLE profile; here the failure stays inside the overlay (this file
 * sits under the segment's layout, so `CollectionOverlay` — its scrim, its
 * Escape, its edge drag — is still up) and the profile is intact underneath:
 * Volver closes the overlay exactly like the collection's own chip.
 *
 * Two things the shell needs from whatever it wraps (collection-overlay.tsx):
 *  - a background that follows `--cx-bg` (the screen paints the stage, not
 *    the shell);
 *  - a `[data-overlay-hero]` that is not the skeleton's: the fan in flight
 *    waits for it, and with none it would hang over this screen forever.
 *    The icon's box takes that role — the fan lands on it and lets go.
 *
 * `retry` re-fetches and re-renders the segment (Next 16.3; see
 * node_modules/next/dist/docs/…/file-conventions/error.md).
 */
const STAGE_BG = { opacity: "var(--cx-bg, 1)" } as const;
const STAGE_HERO = { visibility: "var(--cx-hero, visible)" } as unknown as CSSProperties;
const STAGE_A = { opacity: "var(--cx-a, 1)", translate: "var(--cx-a-t, none)" } as const;

export default function InterceptedCollectionError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-6 pb-dock-clearance text-text">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-bg" style={STAGE_BG} />
      <div
        className="absolute inset-x-6 top-[max(64px,calc(20px+env(safe-area-inset-top)))]"
        style={STAGE_BG}
      >
        <ZoomBackButton className={CHIP_ART} />
      </div>
      <div data-overlay-hero style={STAGE_HERO} className="self-start">
        <KIcon name="warning" size={22} className="text-text" />
      </div>
      <div className="flex flex-col gap-3" style={STAGE_A}>
        <h1 className="font-brand text-[32px] leading-[1.1] text-text text-balance">
          no pudimos cargar esta colección.
        </h1>
        <p className="max-w-[320px] text-[15px] leading-[1.5] text-text-2 text-pretty">
          Lo que guardaste sigue ahí. Revisa tu conexión y vuelve a intentarlo.
        </p>
        <div className="mt-3">
          <button type="button" onClick={() => retry()} className={GLASS_BUTTON}>
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
