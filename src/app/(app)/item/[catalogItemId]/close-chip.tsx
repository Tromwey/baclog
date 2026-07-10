"use client";

import { useRouter } from "next/navigation";

/**
 * ✕ close chip on black glass (mock #p3) — LOCAL to the item detail; every
 * other screen keeps the shared ‹ BackButton. router.back() like it — but the
 * item detail HIDES the dock, so a deep-linked visit with no in-app history
 * would leave the ✕ doing nothing with no other way out: fall back to
 * /backlogs instead.
 */
export function CloseChip() {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/backlogs");
      }}
      aria-label="Cerrar"
      className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/[0.28] text-text backdrop-blur-[18px]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
