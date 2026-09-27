"use client";

import { Toast } from "@/components/kura/toast";
import { useItemReaction } from "./reaction-state";

/** The failure triangle (§patrones · avisos: "Reintentar con triángulo para fallos"). */
export function TriangleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden className="flex-none">
      <path d="M12 3.5l9.5 16.5h-19L12 3.5zM12 10v4.5M12 17.2v.3" />
    </svg>
  );
}

/**
 * The ficha's one aviso (§patrones · avisos): the shared `kura/toast` pill
 * just over the dock (it stays on the ficha since 2026-09-27), one at a
 * time — a new
 * one replaces the old. "Deshacer" for the reversible, the triangle +
 * "Reintentar" for a failure. The state lives in `reaction-state.tsx`.
 */
export function ToastHost() {
  const { toastHost } = useItemReaction();
  return <Toast host={toastHost} bottom="calc(var(--dock-clearance) - 22px)" />;
}
