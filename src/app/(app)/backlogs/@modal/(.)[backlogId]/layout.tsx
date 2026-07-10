import type { ReactNode } from "react";

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
 */
export default function InterceptedZoomShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="bl-zoom-in fixed inset-0 z-50 overflow-y-auto bg-bg"
      style={{ transformOrigin: "50% 32%" }}
    >
      {children}
    </div>
  );
}
