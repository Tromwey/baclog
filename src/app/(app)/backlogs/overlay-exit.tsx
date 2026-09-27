"use client";

import { createContext, useContext } from "react";

/**
 * The collection overlay's animated way out (Colecciones · transiciones §3).
 * `CollectionOverlay` (the profile's intercepted route) provides it;
 * `ZoomBackButton` calls it so the overlay runs its spring back to 0 — the
 * titles leave first and the fan lands in its row on the profile — BEFORE
 * `router.back()` pops the route. Outside the overlay (the full page, the
 * lenses) there is no provider and Volver navigates at once.
 */
export const OverlayExitCtx = createContext<((then: () => void) => void) | null>(null);

export function useOverlayExit(): ((then: () => void) => void) | null {
  return useContext(OverlayExitCtx);
}
