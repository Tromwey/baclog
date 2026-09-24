import type { ReactNode } from "react";

/**
 * The one clean header for the authenticated shell. KURA (2026-09-24): the
 * screen title is Newsreader 400 · 36, lowercase ("tus colecciones" — the
 * caller writes it lowercase), no negative tracking; it sits 64 from the top
 * edge like the frames (or 20 under the iOS safe area when that is taller —
 * an installed PWA). The
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
          ? "sticky top-0 z-[5] isolate px-5 pb-4 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]"
          : "px-5 pb-[18px] pt-[max(64px,calc(20px+env(safe-area-inset-top)))]"
      } ${className}`}
    >
      {glass && (
        <div
          aria-hidden
          // Runs 40px past the header so the fade has room to breathe over
          // the first card (founder call 2026-09-03: the mock's in-box fade
          // was too short at 68px of header).
          className="pointer-events-none absolute inset-x-0 -bottom-10 top-0 -z-10 backdrop-blur-[18px] backdrop-saturate-[1.4]"
          style={{
            background:
              "linear-gradient(rgba(11,11,13,.85), rgba(11,11,13,.55) 70%, rgba(11,11,13,0))",
            maskImage: "linear-gradient(#000 60%, transparent)",
            WebkitMaskImage: "linear-gradient(#000 60%, transparent)",
          }}
        />
      )}
      <div className={`flex justify-between gap-3.5 ${glass ? "items-start" : "items-end"}`}>
        <h1 className="min-w-0 truncate font-brand text-[36px] font-normal leading-[1.02] text-text">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
