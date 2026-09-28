import Link from "next/link";
import { CHIP_44 } from "@/components/kura/components";
import { HDR_PX } from "./feed-geometry";

/**
 * Feed v10 header: "tu feed" in Newsreader 36 on the baseline of the 44 glass
 * bell, 18/20/14 padding, exactly HDR_PX tall so the stack pins under it.
 *
 * NO background (founder call, 2026-09-21): a black slab read as a lid on the
 * stack; with nothing painted the card slides BEHIND the title.
 *
 * The bell: the mock's notifications (31a) don't exist in the product — no
 * follow requests, no stored notices, no "seen" state for a dot — so the
 * bell leads to Tu gente (/feed/gente: people search + suggestions), the one
 * social surface the feed was missing a door to, and it carries NO dot.
 */
export function FeedHeader({ sticky = false }: { sticky?: boolean }) {
  return (
    <header
      className={`${sticky ? "sticky top-0 z-[7]" : ""} box-border flex items-end justify-between gap-3 px-5 pb-[14px] pt-[calc(18px+env(safe-area-inset-top))]`}
      style={{ height: `calc(${HDR_PX}px + env(safe-area-inset-top))` }}
    >
      <h1 className="truncate font-brand text-[36px] leading-none text-text">tu feed</h1>
      <Link href="/feed/gente" aria-label="Tu gente" className={CHIP_44}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
      </Link>
    </header>
  );
}
