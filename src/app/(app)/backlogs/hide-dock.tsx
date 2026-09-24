"use client";

import { useHideNavDock } from "../nav-dock";

/**
 * A collection (flujos-v2 03) has no nav dock — its frames draw none; every
 * action lives in Opciones. Mounted from the (server) view; the ref-counted
 * context fades the dock out while this screen is on stage and releases it
 * on unmount — in the intercepted overlay too, so dismissing the overlay
 * brings the dock back over Tus colecciones.
 */
export function HideDock() {
  useHideNavDock(true);
  return null;
}
