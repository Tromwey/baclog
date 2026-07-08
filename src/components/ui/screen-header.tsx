import type { ReactNode } from "react";
import { MonoMeta } from "./mono-meta";

/**
 * The one clean header for the authenticated shell (M3.5 nav redesign): an
 * optional mono eyebrow (`Baclog · {section}`) over a Bricolage title in
 * sentence case, with an optional trailing action. The avatar deliberately
 * lives in the /perfil tab now, not here — the top stays clean.
 *
 * Side padding is px-4 to match every page body, so the title's left edge
 * lines up with the content below it. Top padding respects the iOS safe area
 * (needs viewportFit:"cover" in the root layout to resolve to non-zero).
 */
export function ScreenHeader({
  eyebrow,
  title,
  action,
  className = "",
}: {
  /** Section word only — the component prepends "Baclog · " itself. */
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`px-4 pb-[26px] pt-[calc(24px+env(safe-area-inset-top))] ${className}`}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          {eyebrow && (
            <div>
              <MonoMeta>Baclog · {eyebrow}</MonoMeta>
            </div>
          )}
          <h1
            className={`truncate font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-text ${
              eyebrow ? "mt-1" : ""
            }`}
          >
            {title}
          </h1>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
