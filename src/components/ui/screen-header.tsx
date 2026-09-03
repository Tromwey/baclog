import type { ReactNode } from "react";

/**
 * The one clean header for the authenticated shell (M3.5 nav redesign): a
 * Bricolage title in sentence case with an optional trailing action. The
 * `Baclog · {section}` eyebrow it used to carry was removed on the founder's
 * call (2026-08-28): inside the app the brand is redundant and the section
 * repeats the title — it only cost vertical space. (The immersive Descubrir
 * loading overlay keeps its own floating label: no h1 there to repeat.)
 *
 * Side padding is px-4 to match every page body, so the title's left edge
 * lines up with the content below it. Top padding respects the iOS safe area
 * (needs viewportFit:"cover" in the root layout to resolve to non-zero).
 *
 * `glass` (feed v3 mock, 2026-09-02): the header sticks to the top over a
 * scrim that fades the scrolled content — gradient .85→.55→0 with
 * blur(18px) saturate(1.4), masked to 60% so the blur has no hard edge —
 * at the mock's 22/20/16 padding (the feed's cards sit at 20 too). The scrim
 * is a layer UNDER the title, not on the header itself: the mock masks the
 * whole header, which would also fade the action chip's lower half.
 */
export function ScreenHeader({
  title,
  action,
  glass = false,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  glass?: boolean;
  className?: string;
}) {
  return (
    <header
      className={`${
        glass
          ? "sticky top-0 z-[5] isolate px-5 pb-4 pt-[calc(22px+env(safe-area-inset-top))]"
          : "px-4 pb-[26px] pt-[calc(24px+env(safe-area-inset-top))]"
      } ${className}`}
    >
      {glass && (
        <div
          aria-hidden
          // Runs 40px past the header so the fade has room to breathe over
          // the first card (founder call 2026-09-03: the mock's in-box fade
          // was too short at 68px of header).
          className="absolute inset-x-0 -bottom-10 top-0 -z-10 backdrop-blur-[18px] backdrop-saturate-[1.4]"
          style={{
            background:
              "linear-gradient(rgba(11,11,13,.85), rgba(11,11,13,.55) 70%, rgba(11,11,13,0))",
            maskImage: "linear-gradient(#000 60%, transparent)",
            WebkitMaskImage: "linear-gradient(#000 60%, transparent)",
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3.5">
        <h1 className="min-w-0 truncate font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-text">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
