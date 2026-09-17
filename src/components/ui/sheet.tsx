"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
  useScrollerTouchAction,
  useSheetMotion,
} from "@/hooks/use-sheet-motion";

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

const DismissCtx = createContext<(() => void) | null>(null);

/** The enclosing sheet's animated close; `null` outside a <Sheet>. */
export function useSheetDismiss(): (() => void) | null {
  return useContext(DismissCtx);
}

/**
 * A button inside a <Sheet> that closes it WITH the exit animation (and then
 * the caller's `onClose` runs, same as a scrim tap). Use it for "Cancelar" /
 * "Cerrar": calling the parent's setter from inside unmounts the sheet cold.
 */
export function SheetClose({
  className,
  children,
  ...rest
}: Omit<ComponentPropsWithoutRef<"button">, "onClick" | "type">) {
  const dismiss = useContext(DismissCtx);
  return (
    <button
      type="button"
      onClick={() => dismiss?.()}
      className={className}
      {...rest}
    >
      {children}
    </button>
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
 *
 * MOTION (`useSheetMotion`): a spring entrance and the same path back out —
 * `onClose` fires AFTER the exit, so callers keep their `{open && <Sheet/>}`
 * and still get a symmetric dismissal from the scrim, Escape and the drag.
 * `bottom` sheets drag to dismiss: 1:1 under the finger, rubber-banded
 * upward, thrown by a flick (projected landing), interruptible mid-flight.
 * The grabber says so. A button INSIDE the sheet that closes it should call
 * `useSheetDismiss()` rather than the caller's setter, or it skips the exit.
 */
export function Sheet(props: {
  onClose: () => void;
  variant?: "bottom" | "center" | "cover";
  /** Accessible name for the dialog. */
  label: string;
  children: ReactNode;
}) {
  // The motion hook measures the panel on mount, so the panel has to exist
  // on the body's first render — the hydration gate lives out here.
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <SheetBody {...props} />;
}

function SheetBody({
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
  // iOS keyboard: the sheet is fixed against the LAYOUT viewport, which the
  // keyboard does NOT shrink — without this lift, a sheet with an input ends
  // up exactly underneath it (founder report, 2026-08-28). The container's
  // bottom padding grows by the covered pixels, and max-h keeps a tall sheet
  // from overflowing the top instead.
  const keyboardInset = useKeyboardInset();

  const bottom = variant === "bottom";
  const cover = variant === "cover";

  const { panelRef, scrimRef, dismiss, panelHandlers } = useSheetMotion({
    onClose,
    draggable: bottom,
  });

  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollerTouchAction(scrollerRef);

  const pad = bottom ? "p-[22px]" : cover ? "" : "p-6";

  return createPortal(
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-50 flex justify-center ${
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
      {/* The dim is its own layer so it can fade with the drag while the
          panel stays solid under the finger. */}
      <div
        ref={scrimRef}
        aria-hidden
        className="absolute inset-0 bg-[rgba(4,4,6,0.32)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        {...panelHandlers}
        className={`relative flex max-h-full w-full max-w-md touch-none flex-col overflow-hidden rounded-[22px] will-change-transform ${
          cover
            ? "bg-surface-1 shadow-[var(--shadow-card)]"
            : "bl-dock-glass shadow-[var(--shadow-glass)]"
        }`}
      >
        {!cover && <div aria-hidden className="bl-grain" />}
        {bottom && (
          // The grabber: the promise that this sheet follows the finger. It
          // sits in the panel's own top padding, so no layout moves for it.
          <div
            data-sheet-handle
            aria-hidden
            className="absolute inset-x-0 top-0 z-10 flex h-[22px] justify-center pt-[9px]"
          >
            <span className="h-1 w-9 rounded-full bg-white/20" />
          </div>
        )}
        <div
          ref={scrollerRef}
          className={`relative min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain ${pad}`}
        >
          <DismissCtx.Provider value={dismiss}>{children}</DismissCtx.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}
