"use client";

import { useRouter } from "next/navigation";
import { CHIP_44 } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";
import { useOverlayExit } from "./overlay-exit";

/**
 * Volver for the collection screens (Kura: 44 glass at 64/24, the frames'
 * chevron at 18 / 2.2). router.back() both dismisses the intercepted overlay
 * (the modal opened by pushing the URL) and pops the full page; a deep link
 * with no history has nowhere to go back to, so it lands on the list.
 *
 * Inside the profile's collection overlay the shell runs its close FIRST
 * (`useOverlayExit`: the fan flies back to its row) and navigates once that
 * spring lands.
 */
export function ZoomBackButton({ className = CHIP_44 }: { className?: string }) {
  const router = useRouter();
  const exit = useOverlayExit();
  return (
    <button
      type="button"
      onClick={() => {
        const leave = () => {
          if (window.history.length > 1) router.back();
          else router.push("/backlogs");
        };
        if (exit) exit(leave);
        else leave();
      }}
      aria-label="Volver"
      className={className}
    >
      <KIcon name="back" size={18} strokeWidth={2.2} />
    </button>
  );
}
