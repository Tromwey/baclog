import { SKELETON_PULSE } from "@/components/kura/components";

/**
 * /onboarding skeleton — the page awaits the account's picks and the first
 * page of the "elige 3" pool (provider calls) before it paints. It can land on
 * O1b (elige tu usuario: heading + three fields) or 32a (elige 3: heading +
 * search + grid), so this stays the shared top only: step mark, a two-line
 * heading, the body line and one h-12 field. No grid — a new account (the
 * common hard load) lands on O1b, and a cover grid there would be a lie.
 * Needs gente/loading.tsx beside it: boundaries nest, and 32b is another shape.
 */
export default function Loading() {
  return (
    <main className="relative h-dvh overflow-hidden bg-bg">
      <div
        className={`mx-auto flex w-full max-w-md flex-col gap-4 px-5 pt-[calc(72px+env(safe-area-inset-top))] ${SKELETON_PULSE}`}
      >
        <div className="h-3 w-12 rounded-full bg-surface-1" />
        <div className="flex flex-col gap-2">
          <div className="h-8 w-4/5 rounded-full bg-surface-1" />
          <div className="h-8 w-1/2 rounded-full bg-surface-1" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-3.5 w-full rounded-full bg-surface-2" />
          <div className="h-3.5 w-2/3 rounded-full bg-surface-2" />
        </div>
        <div className="h-12 rounded-full bg-surface-1" />
      </div>
    </main>
  );
}
