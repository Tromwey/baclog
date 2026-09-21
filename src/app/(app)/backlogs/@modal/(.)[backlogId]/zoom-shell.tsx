"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clearZoomOrigin, readZoomOrigin } from "../../zoom-origin";

/** The mock's resting origin — used when nothing recorded a tap (keyboard
 *  activation, a programmatic push). */
const FALLBACK_ORIGIN = "50% 32%";

export function ZoomShell({ children }: { children: ReactNode }) {
  // Read once per mount: the shell mounts once per open (it lives in the
  // segment layout), so this is the tap that opened it.
  const [origin] = useState(() => {
    const o = readZoomOrigin();
    return o ? `${Math.round(o.x)}px ${Math.round(o.y)}px` : FALLBACK_ORIGIN;
  });
  // Cleared in an effect, not in the initializer: strict mode runs that twice.
  useEffect(() => {
    clearZoomOrigin();
  }, []);
  return (
    <div
      className="bl-zoom-in fixed inset-0 z-50 overflow-y-auto bg-bg"
      style={{ transformOrigin: origin }}
    >
      {children}
    </div>
  );
}
