"use client";

import { useHideNavDock } from "../../nav-dock";

/**
 * The item detail is a zoom-pushed view: back + ⋯ up top, action bar below,
 * NO nav dock (HANDOFF §6). Mounted from the (server) page; the ref-counted
 * context fades the dock out while this screen is on stage and releases it
 * on unmount.
 */
export function HideDock() {
  useHideNavDock(true);
  return null;
}
