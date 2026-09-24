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
 * drift apart again.
 *
 * ALWAYS portaled to <body>: the (app) content wrapper is a stacking context,
 * so a `fixed` sheet rendered inside it gets trapped UNDER the floating dock
 * (AGENTS.md). Portaling is the fix; never lower the dock's z-index.
 *
 * KURA (sistema de diseño §hoja + flujos-v2, 2026-09-24): the sheet is a flat
 * `--s2` surface floating 8 px inside the screen edges, radius 36, the dark
 * `--sh-float` depth shadow, a 36×5 grabber — and behind it a real scrim
 * (`rgba(5,5,6,.62)`, the frames' value). No glass, no grain, no border.
 * "Nunca dos hojas a la vez": callers swap a sheet's CONTENT (a sub-step)
 * instead of opening a second one on top.
 *
 * Three variants:
 * - `bottom` (default) — routine sheets: pick something, name something.
 * - `center` — the rare celebration: centered, so it reads as an event.
 * - `cover` — centered, with NO padding: for a sheet whose first child is
 *   full-bleed artwork (F3.8 Novedades). The child owns its own insets.
 *
 * `pad` (bottom only): `form` = the frames' 10/20/26 (title + field + solid
 * action), `menu` = 10/12/26 (rows that carry their own 10 px inset).
 *
 * Borderless and glow-free by construction: the only depth is a dark neutral
 * shadow (exempt).
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
  pad?: "form" | "menu";
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
  pad: padKind = "form",
  label,
  children,
}: {
  onClose: () => void;
  variant?: "bottom" | "center" | "cover";
  pad?: "form" | "menu";
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

  const pad = bottom
    ? padKind === "menu"
      ? "px-3 pb-[calc(26px+env(safe-area-inset-bottom))]"
      : "px-5 pb-[calc(26px+env(safe-area-inset-bottom))]"
    : cover
      ? ""
      : "p-6";

  return createPortal(
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-50 flex justify-center ${
        bottom ? "items-end p-2" : "items-center p-6"
      }`}
      style={
        keyboardInset > 0
          ? {
              paddingBottom: bottom
                ? `calc(${keyboardInset}px + 8px)`
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
        className="absolute inset-0 bg-[rgba(5,5,6,0.62)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        {...panelHandlers}
        className={`relative flex max-h-full w-full max-w-md touch-none flex-col overflow-hidden will-change-transform ${
          cover
            ? "rounded-[var(--r-screen)] bg-surface-1 shadow-float"
            : "rounded-[36px] bg-surface-2 shadow-float"
        }`}
      >
        {bottom && (
          // The grabber (36×5, the frames' `rgba(255,255,255,.18)`): the
          // promise that this sheet follows the finger. In flow, 10 px from
          // the top, so the content starts where the frames start it.
          <div
            data-sheet-handle
            aria-hidden
            className="flex flex-none justify-center pb-2.5 pt-2.5"
          >
            <span className="h-[5px] w-9 rounded-full bg-white/[0.18]" />
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
