import type { CSSProperties } from "react";
import { CHIP_ART } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { ZoomBackButton } from "../../../../backlogs/zoom-back-button";

/**
 * The collection overlay's own 404 (`notFound()` from the intercepted page:
 * a collection that isn't the viewer's). Without it the signal climbed to the
 * nearest boundary above the slot — `(app)/not-found.tsx` — and replaced the
 * WHOLE profile; here it stays inside the overlay (this file sits under the
 * segment's layout, so `CollectionOverlay` is still up) and Volver closes it
 * like the collection's own chip.
 *
 * Same frame and same contract with the shell as `error.tsx` next to it (a
 * background on `--cx-bg`, a `[data-overlay-hero]` for the fan to land on),
 * same words as `(app)/not-found.tsx`: it never says which thing is missing
 * nor whether it exists. No Reintentar — asking again gives the same answer.
 */
const STAGE_BG = { opacity: "var(--cx-bg, 1)" } as const;
const STAGE_HERO = { visibility: "var(--cx-hero, visible)" } as unknown as CSSProperties;
const STAGE_A = { opacity: "var(--cx-a, 1)", translate: "var(--cx-a-t, none)" } as const;

export default function InterceptedCollectionNotFound() {
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
          esto no existe o es privado
        </h1>
        <p className="max-w-[320px] text-[15px] leading-[1.5] text-text-2 text-pretty">
          Este link no lleva a nada que puedas ver. Revisa que esté completo.
        </p>
      </div>
    </div>
  );
}
