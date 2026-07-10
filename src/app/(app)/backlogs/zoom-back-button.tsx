"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Glass back control for the zoom/lens heroes (mock #p2). router.back() both
 * dismisses the intercepted overlay (the modal opened by pushing the URL) and
 * pops the full page; for deep links with no history the dock is the fallback.
 */
export function ZoomBackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      aria-label="Volver"
      className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/[0.08] text-text backdrop-blur-[18px]"
    >
      <ChevronLeft size={18} />
    </button>
  );
}
