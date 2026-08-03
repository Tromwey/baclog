import type { ReactNode } from "react";

/**
 * Join the parts of a mono meta line with " · ".
 *
 * Exists because these lines aren't all strings: F3.8 seats the countdown in
 * the YEAR's slot on both item pages, so the line carries an element and can't
 * be a plain `.join()`. Dropping the falsy parts BEFORE joining is what makes
 * the separator a single decision — a part that isn't there can't leave a
 * dangling "·" behind it, and callers never spell the separator themselves.
 */
export function joinMeta(parts: ReactNode[]): ReactNode[] {
  return parts
    .filter(Boolean)
    .flatMap((part, i) => (i ? [" · ", part] : [part]));
}

/** Zero-pad a count to 2 digits ("03") — the mono index/count treatment. */
export const pad = (n: number) => String(n).padStart(2, "0");

/** Capitalize the first letter. Catalog genres are stored lowercased — both
 * sources (iTunes lowercases; TMDB's static GENRES map is lowercase too) — so
 * meta lines that render in mixed case (not CSS force-uppercased) normalize
 * through this before display. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
