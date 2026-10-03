"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import type { FeedCard, FeedSuggestion } from "@/modules/social/types";
import { FeedCardView, SuggestCard, hexesOfCard } from "./feed-card";
import { BAND_RISE_PX, CARD_RADIUS, STICKY_TOP, cardTailHex } from "./feed-geometry";
import { GLASS_BUTTON } from "@/components/kura/components";

/**
 * F3.10 — the populated feed as a STACK (Feed v8 Stack, 2026-09-21; Feed
 * v10 · Kura details 2026-09-24 — see feed-card.tsx).
 *
 * This owns the scroll container, and that is not incidental: the cards pin
 * with `position: sticky` under the header, so the header has to live in the
 * SAME scrollport as the cards. The page hands it in as `header`.
 *
 * The snap is MANDATORY, not proximity: every gesture has to land with a
 * card's top edge at the header, never half way — the feed reads like tabs
 * rather than like a scroll that happens to stick.
 *
 * The last card's bottom colour (the mock's `tailBg`) goes on a SPACER after
 * the stack, not on the scroller. On the scroller it also painted the strip
 * behind the header — and since the header has no background of its own, the
 * title ended up sitting on the tint of a card far below, which read as an
 * aura (founder report, 2026-09-22). On the spacer it does its actual job:
 * the page continues in the stack's own light at the BOTTOM instead of
 * cutting to the background.
 *
 * "Ver más" pages through the server action with the keyset cursor the server
 * re-encoded from the last event the previous page consumed, so a burst never
 * repeats and only splits when one run outgrows the whole chunk budget (see
 * getFeedCards).
 *
 * The suggestion is not a card of the feed: it sits at a fixed slot of the
 * FIRST page and never moves when more pages arrive. A page shorter than that
 * slot shows it last. It is PINNED at mount, like the cards: following someone
 * revalidates /feed, the server re-renders and getFeedSuggestion now offers
 * the NEXT person — rendering that new prop in the same slot swapped the card
 * under a button that still held "Siguiendo" for the previous one (founder
 * report, 2026-09-02). The key on the card is the belt to that suspender.
 *
 * A failed load keeps the cursor and SAYS so on the button: the route error
 * boundary would remount the list and drop every page already read, and a
 * silent retap is indistinguishable from the end of the feed.
 *
 * The bands (iOS `FeedStackCard`, 2026-09-27): the first card runs up behind
 * the header, so without them the header would keep card 0's colour while
 * later cards pin under it. Each later card's band rises over the header in
 * the last BAND_RISE_PX before the card pins — `useStackBands` writes
 * `--rise` (smoothstep) and `--p` per frame, straight to the DOM (a scroll
 * frame never re-renders React). It's geometry tied to the finger, not an
 * animation, so it stays with Reduce Motion.
 */
const SUGGEST_SLOT = 2;

export function FeedList({
  initialCards,
  initialCursor,
  suggestion,
  header,
}: {
  initialCards: FeedCard[];
  initialCursor: string | null;
  suggestion: FeedSuggestion | null;
  header: React.ReactNode;
}) {
  const [cards, setCards] = useState(initialCards);
  const [cursor, setCursor] = useState(initialCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [pinned] = useState(suggestion);
  const slot = pinned ? Math.min(SUGGEST_SLOT, initialCards.length) : -1;

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      try {
        const page = await loadMoreFeedAction({ cursor });
        setCards((prev) => [...prev, ...page.cards]);
        setCursor(page.nextCursor);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }

  const scroller = useRef<HTMLDivElement>(null);
  useStackBands(scroller, cards.length);

  const last = cards[cards.length - 1];
  const tail = last ? cardTailHex(hexesOfCard(last)) : "var(--bg)";

  return (
    <div
      ref={scroller}
      className="bl-scroll box-border h-full overflow-x-hidden overflow-y-auto [scroll-snap-type:y_mandatory]"
      style={{ paddingBottom: "120px", scrollPaddingTop: STICKY_TOP }}
    >
      {header}
      <div className="flex flex-col">
        {cards.map((card, i) => (
          <Fragment key={card.kind === "burst" ? card.id : card.event.id}>
            {i === slot && pinned && <SuggestCard key={pinned.username} s={pinned} first={i === 0} />}
            <FeedCardView card={card} first={i === 0 && !(slot === 0 && pinned)} />
          </Fragment>
        ))}
        {slot === cards.length && pinned && <SuggestCard key={pinned.username} s={pinned} />}
        {/* The stack's light continues past the last card (see above). */}
        <div aria-hidden className="h-[120px] flex-none" style={{ background: tail }} />
        {cursor && (
          <div className="flex justify-center px-5 pb-1 pt-3.5">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className={`${GLASS_BUTTON} disabled:opacity-60`}
            >
              {loading
                ? "Cargando…"
                : failed
                  ? "No se cargó lo anterior · Reintentar"
                  : "Ver más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Lifts each card's band (`[data-feed-band]`, see StackCard) as the card
 * nears the header line: p = 0 → 1 over the last BAND_RISE_PX, rise =
 * (header + radius) · smoothstep(p) — iOS `FeedStackCard` to the point.
 */
function useStackBands(scroller: React.RefObject<HTMLDivElement | null>, count: number) {
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const hdr = el.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top;
      const lift = hdr + CARD_RADIUS;
      for (const band of el.querySelectorAll<HTMLElement>("[data-feed-band]")) {
        const card = band.parentElement;
        if (!card) continue;
        const y = card.getBoundingClientRect().top - top;
        const p = Math.min(Math.max(1 - (y - hdr) / BAND_RISE_PX, 0), 1);
        const rise = lift * p * p * (3 - 2 * p);
        band.style.setProperty("--rise", `${rise.toFixed(2)}px`);
        band.style.setProperty("--p", p.toFixed(3));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      el.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, count]);
}
