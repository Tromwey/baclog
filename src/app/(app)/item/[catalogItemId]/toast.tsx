"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useItemReaction } from "./reaction-state";

/** The failure triangle (§patrones · avisos: "Reintentar con triángulo para fallos"). */
export function TriangleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden className="flex-none">
      <path d="M12 3.5l9.5 16.5h-19L12 3.5zM12 10v4.5M12 17.2v.3" />
    </svg>
  );
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The ficha's one aviso (§patrones · avisos): a `--s2` pill where the dock
 * would be (the ficha hides the dock), 5 s, one at a time — a new one replaces
 * the old. "Deshacer" for the reversible, the triangle + "Reintentar" for a
 * failure. Portaled to <body> so it sits above the (app) wrapper.
 */
export function ToastHost() {
  const { toast, clearToast } = useItemReaction();
  const hydrated = useHydrated();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, 5000);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!hydrated || !toast) return null;
  const { action } = toast;
  return createPortal(
    <div
      key={toast.key}
      role="status"
      aria-live="polite"
      className="bl-rise fixed inset-x-4 bottom-[calc(34px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[358px] items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-[18px] pr-1.5 text-text shadow-float"
    >
      {action?.failure && <TriangleGlyph />}
      <span className="min-w-0 flex-1 py-2 text-[14px] leading-[1.3]">{toast.text}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            clearToast();
            action.run();
          }}
          className="flex h-10 flex-none items-center rounded-full px-3 text-[14px] font-semibold text-text transition-opacity active:opacity-60"
        >
          {action.label}
        </button>
      )}
    </div>,
    document.body,
  );
}
