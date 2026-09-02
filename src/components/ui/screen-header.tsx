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
 */
export function ScreenHeader({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`px-4 pb-[26px] pt-[calc(24px+env(safe-area-inset-top))] ${className}`}
    >
      <div className="flex items-start justify-between gap-3.5">
        <h1 className="min-w-0 truncate font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-text">
          {title}
        </h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
