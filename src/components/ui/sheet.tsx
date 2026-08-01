"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The app's one sheet. Every modal surface goes through here so they can't
 * drift apart again — before this, the same idea existed in four slightly
 * different sets of numbers (radius 28 vs 22, two scrims, two glass alphas).
 *
 * ALWAYS portaled to <body>: the (app) content wrapper is a stacking context,
 * so a `fixed` sheet rendered inside it gets trapped UNDER the floating dock
 * (AGENTS.md). Portaling is the fix; never lower the dock's z-index.
 *
 * Two variants, and the difference carries meaning:
 * - `bottom` (default) — routine sheets: pick something, name something. Opaque
 *   surface, floating clear of the screen edges, thumb-reachable.
 * - `center` — the rare celebration. Glass (the system's --glass tokens),
 *   centered, so it reads as an event rather than a control.
 *
 * Borderless and glow-free by construction (HANDOFF §7): the only depth is the
 * dark --shadow-card.
 */
export function Sheet({
  onClose,
  variant = "bottom",
  label,
  children,
}: {
  onClose: () => void;
  variant?: "bottom" | "center";
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}) {
  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bottom = variant === "bottom";

  return createPortal(
    <div
      onClick={onClose}
      className={`bl-fade-in fixed inset-0 z-50 flex justify-center bg-[rgba(4,4,6,0.66)] backdrop-blur-[6px] ${
        bottom
          ? "items-end p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
          : "items-center p-6"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={`bl-sheet relative w-full max-w-md overflow-hidden rounded-[22px] shadow-[var(--shadow-card)] ${
          bottom
            ? "bg-surface-1 p-[22px]"
            : "bg-[var(--glass-bg)] p-6 backdrop-blur-[20px] backdrop-saturate-[1.4]"
        }`}
      >
        <div aria-hidden className="bl-grain" />
        <div className="relative">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
