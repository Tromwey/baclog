"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clearNavDirection, readNavDirection } from "./nav-direction";

/**
 * The enter animation for each page. Lives in template.tsx, which Next
 * remounts on every navigation, so the direction is read fresh per navigation.
 *
 * Kura (§movimiento, 2026-09-24): "cambio de tab 0 ms". A dock move between
 * tabs (the dock sets a direction right before navigating) lands with NO
 * animation — the carousel slide of the Revamp is gone. Every other
 * navigation (open a collection, a title, a setting) keeps the short fade.
 */
export function PageSlide({ children }: { children: ReactNode }) {
  // Read once per mount (template remounts on navigation).
  const [dir] = useState(() => readNavDirection());
  useEffect(() => {
    clearNavDirection();
  }, []);

  return <div className={dir === 0 ? "bl-fade-in" : undefined}>{children}</div>;
}
