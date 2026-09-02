"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

/**
 * "Has this hydrated?" — false on the server, true in the browser.
 *
 * Sheets used to be unreachable before an interaction, so `document` was always
 * defined by the time one rendered. F3.8's Novedades sheet is the first that a
 * SERVER component renders straight away, and createPortal(…, document.body)
 * during SSR takes the whole page down with `document is not defined`. This is
 * the isomorphic guard (no setState in an effect, so no cascading render).
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The app's one sheet. Every modal surface goes through here so they can't
 * drift apart again — before this, the same idea existed in four slightly
 * different sets of numbers (radius 28 vs 22, two scrims, two glass alphas).
 *
 * ALWAYS portaled to <body>: the (app) content wrapper is a stacking context,
 * so a `fixed` sheet rendered inside it gets trapped UNDER the floating dock
 * (AGENTS.md). Portaling is the fix; never lower the dock's z-index.
 *
 * Three variants:
 * - `bottom` (default) — routine sheets: pick something, name something.
 *   Floating clear of the screen edges, thumb-reachable.
 * - `center` — the rare celebration: centered, so it reads as an event.
 * - `cover` — centered, with NO padding: for a sheet whose first child is
 *   full-bleed artwork (F3.8 Novedades). The child owns its own insets.
 *
 * SURFACE (founder call 2026-08-28): bottom and center wear the DOCK's glass
 * (bl-dock-glass + --shadow-glass) so every floating control in the app is
 * the same material. The scrim behind is a LIGHT dim only — no backdrop-blur
 * and no heavy darkening (founder correction, same day): the glass IS the
 * modal, and it only reads as glass when live content stays visible behind it
 * for the panel's own blur to transluce — exactly how the dock earns its look
 * over the auras. `cover` stays opaque: artwork needs a solid backing to read
 * against, and the grain overlay is skipped there for the same reason.
 *
 * Borderless and glow-free by construction (HANDOFF §7): the only depth is a
 * dark neutral shadow (exempt).
 */
export function Sheet({
  onClose,
  variant = "bottom",
  label,
  children,
}: {
  onClose: () => void;
  variant?: "bottom" | "center" | "cover";
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  // iOS keyboard: the sheet is fixed against the LAYOUT viewport, which the
  // keyboard does NOT shrink — without this lift, a sheet with an input ends
  // up exactly underneath it (founder report, 2026-08-28). The container's
  // bottom padding grows by the covered pixels, and max-h keeps a tall sheet
  // from overflowing the top instead.
  const keyboardInset = useKeyboardInset();

  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!hydrated) return null;

  const bottom = variant === "bottom";
  const cover = variant === "cover";

  const surface = bottom
    ? "bl-dock-glass p-[22px]"
    : cover
      ? "bg-surface-1"
      : "bl-dock-glass p-6";

  return createPortal(
    <div
      onClick={onClose}
      className={`bl-fade-in fixed inset-0 z-50 flex justify-center bg-[rgba(4,4,6,0.32)] ${
        bottom
          ? "items-end p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
          : "items-center p-6"
      }`}
      style={
        keyboardInset > 0
          ? {
              paddingBottom: bottom
                ? `calc(${keyboardInset}px + 20px + env(safe-area-inset-bottom))`
                : `calc(${keyboardInset}px + 24px)`,
            }
          : undefined
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={`bl-sheet relative w-full max-w-md rounded-[22px] ${
          cover
            ? "overflow-hidden shadow-[var(--shadow-card)]"
            : "max-h-full overflow-y-auto overflow-x-hidden shadow-[var(--shadow-glass)]"
        } ${surface}`}
      >
        {!cover && <div aria-hidden className="bl-grain" />}
        <div className={cover ? undefined : "relative"}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
