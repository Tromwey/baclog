import { SKELETON_PULSE } from "@/components/kura/components";
import { FeedHeader } from "./feed-header";
import {
  BAND_SHADOW_ALPHA,
  CARD_RADIUS,
  NEUTRAL_HEXES,
  STICKY_TOP,
  bandShadow,
  cardBackground,
  tierHeight,
} from "./feed-geometry";

/**
 * /feed skeleton — the loaded stack AT REST, from the same numbers
 * (`feed-geometry.ts`), so the swap to content doesn't move an edge (founder,
 * 2026-09-27: the old one started its card under the title; the feed runs
 * card 0 up to the top). The real header ("tu feed" + bell) over card 0,
 * which runs up behind it with no corners and starts its content under it;
 * card 1 at header + card 0's M height, 26 corners, with the band's resting
 * shadow. Inside each card the M layout: author chip 36 · 14 · a 2:3 cover
 * filling the art · 14 · a 30 pill · 9 · one Newsreader 26 line · 22 to the
 * edge. Neutral tint — the colour is the one thing a skeleton can't know.
 * Only the placeholders pulse (§patrones · cargando), never the header.
 */
export default function Loading() {
  const h = tierHeight("M");
  const bg = cardBackground(NEUTRAL_HEXES);
  return (
    <main
      aria-busy="true"
      aria-label="Cargando tu feed"
      className="relative isolate mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg text-text"
    >
      <div className="absolute inset-x-0 top-0 z-[7]">
        <FeedHeader />
      </div>
      <div
        data-feed-skeleton="0"
        className="flex-none"
        style={{ height: `calc(${h} + ${STICKY_TOP})`, background: bg }}
      >
        <SkeletonCardBody topPad={`calc(18px + ${STICKY_TOP})`} />
      </div>
      <div
        data-feed-skeleton="1"
        className="min-h-0 flex-1 overflow-hidden"
        style={{
          background: bg,
          borderTopLeftRadius: CARD_RADIUS,
          borderTopRightRadius: CARD_RADIUS,
          boxShadow: bandShadow(BAND_SHADOW_ALPHA),
        }}
      >
        <div style={{ height: h }}>
          <SkeletonCardBody topPad="18px" />
        </div>
      </div>
    </main>
  );
}

function SkeletonCardBody({ topPad }: { topPad: string }) {
  return (
    <div
      aria-hidden
      className={`flex h-full flex-col gap-3.5 px-5 pb-[22px] ${SKELETON_PULSE}`}
      style={{ paddingTop: topPad }}
    >
      <div className="flex h-9 w-[168px] flex-none items-center rounded-full bg-[var(--glass-bg)] pl-1">
        <div className="h-7 w-7 rounded-full bg-surface-2" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="aspect-[2/3] h-full max-w-full rounded-[var(--r-cover-l)] bg-surface-2" />
      </div>
      <div className="flex flex-none flex-col gap-[9px]">
        <div className="h-[30px] w-[150px] rounded-full bg-[var(--glass-bg)]" />
        {/* One title line: Newsreader 26 × 1.08. */}
        <div className="flex h-[28.08px] items-center">
          <div className="h-[22px] w-[210px] rounded-[6px] bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
