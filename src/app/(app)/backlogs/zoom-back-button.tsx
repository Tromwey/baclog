"use client";

import { useRouter } from "next/navigation";
import { CHIP_44 } from "@/components/kura/components";
import { KIcon } from "@/components/kura/icons";

/**
 * Volver for the collection screens (Kura: 44 glass at 64/24, the frames'
 * chevron at 18 / 2.2). router.back() both dismisses the intercepted overlay
 * (the modal opened by pushing the URL) and pops the full page; a deep link
 * with no history has nowhere to go back to, so it lands on the list.
 */
export function ZoomBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/backlogs");
      }}
      aria-label="Volver"
      className={CHIP_44}
    >
      <KIcon name="back" size={18} strokeWidth={2.2} />
    </button>
  );
}
