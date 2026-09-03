"use client";

import { useHideNavDock } from "../nav-dock";

/**
 * The backlog detail (Revamp UI screen 03) has no nav dock: the floating
 * "Agregar título" takes its place. Mounted from the (server) view; the
 * ref-counted context fades the dock out while this screen is on stage and
 * releases it on unmount — in the intercepted overlay too, so dismissing the
 * overlay brings the dock back over the list.
 */
export function HideDock() {
  useHideNavDock(true);
  return null;
}
