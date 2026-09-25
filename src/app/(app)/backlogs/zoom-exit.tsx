"use client";

import { createContext, useContext } from "react";

/**
 * The zoom overlay's animated way out. `ZoomShell` (the intercepted route's
 * layout) provides it; `ZoomBackButton` calls it so the overlay shrinks back
 * into the card it bloomed from BEFORE `router.back()` pops the route. Outside
 * the overlay (the full page, the lenses) there is no provider and Volver
 * navigates at once.
 */
export const ZoomExitCtx = createContext<((then: () => void) => void) | null>(null);

export function useZoomExit(): ((then: () => void) => void) | null {
  return useContext(ZoomExitCtx);
}
