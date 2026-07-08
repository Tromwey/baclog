"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clearNavDirection, readNavDirection } from "./nav-direction";

/**
 * Plays the enter animation for each page. Lives in template.tsx, which Next
 * remounts on every navigation, so the direction is read fresh per navigation:
 * a dock move between tabs slides horizontally (carousel), anything else fades.
 */
export function PageSlide({ children }: { children: ReactNode }) {
  // Read once per mount (template remounts on navigation).
  const [dir] = useState(() => readNavDirection());
  useEffect(() => {
    clearNavDirection();
  }, []);

  const cls =
    dir === 1 ? "bl-slide-r" : dir === -1 ? "bl-slide-l" : "bl-fade-in";
  return <div className={cls}>{children}</div>;
}
