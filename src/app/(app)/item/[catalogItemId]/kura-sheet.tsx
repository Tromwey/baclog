"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
  useScrollerTouchAction,
  useSheetMotion,
} from "@/hooks/use-sheet-motion";

/**
 * The Kura floating sheet (sistema §componentes · hoja, flujos-v2 19h / 26a /
 * O10a): `--s2`, radius 36, inset 8 from the edges, the dark float shadow, the
 * 36×5 grabber and a heavier scrim (rgba(5,5,6,.62)) than the app's legacy
 * glass `<Sheet>`. Every sheet of the ficha — Completar, guardar en, Opciones,
 * the review's own sheets — goes through here so they can't drift apart.
 *
 * Built on the same motion hook as `<Sheet>` (spring in, same path out,
 * drag-to-dismiss) and the same `touch-action` recipe
 * (learnings/2026-09-17-hojas-con-gesto…): panel `touch-none`, the inner
 * scroller opts back into `pan-y` only while it overflows. Portaled to <body>
 * (AGENTS.md: the (app) wrapper traps fixed surfaces under the dock). The
 * hydration gate lives OUTSIDE the body that owns the hook.
 *
 * `hidden`: "Nunca dos hojas a la vez: una hoja que abre otra la reemplaza."
 * The Completar sheet stays MOUNTED (its slider and draft survive) while the
 * "guardar en" picker it asked for is on screen, so it is hidden, not closed —
 * and a hidden sheet ignores Escape.
 *
 * Generic Kura — lives here because the ficha owns no shared directory;
 * candidate for `src/components/kura/` (reported).
 */

const DismissCtx = createContext<(() => void) | null>(null);

/** The enclosing sheet's animated close (runs the exit, then `onClose`). */
export function useKuraSheetDismiss(): () => void {
  const dismiss = useContext(DismissCtx);
  return dismiss ?? (() => {});
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function KuraSheet(props: {
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  hidden?: boolean;
  /** Horizontal padding of the content (19h rows: 12 · O10a list: 20). */
  className?: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <KuraSheetBody {...props} />;
}

function KuraSheetBody({
  onClose,
  label,
  hidden = false,
  className = "px-3",
  children,
}: {
  onClose: () => void;
  label: string;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const keyboardInset = useKeyboardInset();
  const { panelRef, scrimRef, dismiss, panelHandlers } = useSheetMotion({ onClose });
  const scrollerRef = useRef<HTMLDivElement>(null);
  useScrollerTouchAction(scrollerRef);

  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, hidden]);

  return createPortal(
    <div className="fixed inset-0 z-50" style={hidden ? { display: "none" } : undefined}>
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-[rgba(5,5,6,0.62)]" onClick={dismiss} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        {...panelHandlers}
        className="absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] mx-auto flex max-h-[calc(100dvh-72px)] max-w-md touch-none flex-col overflow-hidden rounded-[36px] bg-surface-2 pb-[26px] pt-2.5 text-text shadow-float will-change-transform"
        style={keyboardInset > 0 ? { bottom: keyboardInset + 8 } : undefined}
      >
        <button
          type="button"
          data-sheet-handle
          onClick={dismiss}
          aria-label="Cerrar"
          className="-mt-1 mb-1 flex h-5 flex-none items-center self-center px-4"
        >
          <span className="h-[5px] w-9 rounded-full bg-white/[0.18]" />
        </button>
        <div
          ref={scrollerRef}
          className={`bl-scroll flex min-h-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain ${className}`}
        >
          <DismissCtx.Provider value={dismiss}>{children}</DismissCtx.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A 56 px sheet row (O10a): glass tile 40 with the glyph, label 16/500, optional note. */
export function SheetRow({
  icon,
  label,
  note,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  note?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 w-full items-center gap-3.5 py-1 text-left transition-opacity active:opacity-70 disabled:opacity-40"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-[var(--glass-bg)] text-text">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[16px] font-medium text-text">{label}</span>
        {note && <span className="text-[13px] leading-[1.4] text-text-2">{note}</span>}
      </span>
    </button>
  );
}

/** Stroke glyph at the sheet's 18 px (stroke 1.8, round joins). */
export function SheetIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
