import type { ReactNode } from "react";
import { ZoomShell } from "./zoom-shell";

/**
 * The zoom overlay's animated shell. It lives in the LAYOUT (not page/loading)
 * so the card→overlay bloom plays exactly ONCE per open: layouts persist
 * across the Suspense swap from loading.tsx to page.tsx — putting bl-zoom-in
 * on each of those instead made the overlay visibly "open twice" (skeleton
 * bloomed, then the real content bloomed again).
 *
 * z-50 stays trapped inside the (app) content wrapper's stacking context, so
 * the dock (a later z-10 sibling) keeps painting on top — exactly the mock
 * #p2 framing; do NOT portal this one.
 *
 * The shell itself is `zoom-shell.tsx` (client): it blooms from the point the
 * shelf was tapped (`zoom-origin.ts`), so the detail grows out of its source.
 */
export default function InterceptedZoomShell({
  children,
}: {
  children: ReactNode;
}) {
  return <ZoomShell>{children}</ZoomShell>;
}
