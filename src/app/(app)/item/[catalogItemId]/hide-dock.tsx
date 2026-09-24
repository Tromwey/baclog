"use client";

import { useHideNavDock } from "../../nav-dock";

/**
 * The ficha is a pushed view: Volver + Opciones up top, NO nav dock (HANDOFF
 * §6) — the aviso pill takes the dock's place at the bottom. Mounted from the (server) page; the ref-counted
 * context fades the dock out while this screen is on stage and releases it
 * on unmount.
 */
export function HideDock() {
  useHideNavDock(true);
  return null;
}
