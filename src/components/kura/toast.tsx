"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { KIcon } from "./icons";

/**
 * Confirmar y deshacer (sistema de diseño §patrones · 35b / O4b): everything
 * that isn't irreversible happens AT ONCE and says so in a `--s2` pill with
 * "Deshacer"; a failure says what happened, with a triangle and "Reintentar".
 * One at a time — a new one retires the old — and an undo lives 5 s.
 *
 * `onExpire` is the COMMIT hook for deferred writes: a remove that would lose
 * data if undone after the fact (the last membership GC's the title's state)
 * is only hidden optimistically and committed when its toast leaves — by
 * timeout, by being replaced, or by the screen unmounting.
 */

export interface ToastSpec {
  message: string;
  kind?: "undo" | "error";
  actionLabel?: string;
  onAction?: () => void;
  /** Runs once when the toast leaves WITHOUT its action being pressed. */
  onExpire?: () => void;
}

const UNDO_MS = 5000;
const ERROR_MS = 8000;

export function useToast() {
  const [toast, setToast] = useState<(ToastSpec & { id: number }) | null>(null);
  const current = useRef<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const retire = useCallback((pressed: boolean) => {
    const t = current.current;
    current.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (t && !pressed) t.onExpire?.();
    setToast(null);
  }, []);

  const show = useCallback(
    (spec: ToastSpec) => {
      if (current.current) retire(false);
      seq.current += 1;
      const t = { ...spec, id: seq.current };
      current.current = t;
      setToast(t);
      timer.current = setTimeout(
        () => {
          if (current.current?.id === t.id) retire(false);
        },
        spec.kind === "error" ? ERROR_MS : UNDO_MS,
      );
    },
    [retire],
  );

  const act = useCallback(() => {
    const t = current.current;
    retire(true);
    t?.onAction?.();
  }, [retire]);

  // Leaving the screen commits whatever is pending (and a page hide, which
  // on iOS may be the last thing that runs).
  useEffect(() => {
    const onHide = () => {
      if (current.current) retire(false);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      const t = current.current;
      current.current = null;
      if (timer.current) clearTimeout(timer.current);
      t?.onExpire?.();
    };
  }, [retire]);

  return { toast, show, act, dismiss: () => retire(false) };
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The pill itself, portaled to <body> (the app shell traps fixed layers).
 * `bottom` = distance from the bottom edge: 40 on screens without the dock,
 * clear of the dock on screens with it.
 */
export function Toast({
  toast,
  onAction,
  bottom = 40,
}: {
  toast: (ToastSpec & { id: number }) | null;
  onAction: () => void;
  bottom?: number;
}) {
  const hydrated = useHydrated();
  if (!hydrated || !toast) return null;
  const error = toast.kind === "error";
  return createPortal(
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="bl-rise fixed inset-x-4 z-[60] mx-auto flex max-w-[calc(28rem-32px)] items-center gap-3 rounded-full bg-surface-2 py-0 pl-5 pr-2 shadow-float min-h-14"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom))` }}
    >
      {error && <KIcon name="warning" size={16} className="-ml-0.5 text-text" />}
      <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-text">{toast.message}</span>
      {toast.actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={
            error
              ? "flex min-h-11 flex-none items-center px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text transition-opacity active:opacity-60"
              : "flex-none rounded-full bg-[var(--glass-bg)] px-3.5 py-2.5 font-sans text-[15px] font-semibold text-text bl-press"
          }
        >
          {toast.actionLabel}
        </button>
      )}
    </div>,
    document.body,
  );
}
