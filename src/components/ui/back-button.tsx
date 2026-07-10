"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Circular back control (M3.5). Uses router.back() so it returns to wherever
 * the user came from (search, a backlog zoom, a reco). For screens reached by
 * deep link with no history, the nav dock (always visible now) is the fallback.
 */
export function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      aria-label="Volver"
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.28] text-text backdrop-blur-[18px] transition-colors hover:bg-black/[0.4] ${className}`}
    >
      <ChevronLeft size={20} />
    </button>
  );
}
