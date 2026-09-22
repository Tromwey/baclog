"use client";

import { Fragment, useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import type { FeedCard, FeedSuggestion } from "@/modules/social/types";
import { FeedCardView, HDR_PX, SuggestCard, cardTailHex, hexesOfCard } from "./feed-card";

/**
 * F3.10 — the populated feed as a STACK (Feed v8 Stack, 2026-09-21).
 *
 * This owns the scroll container, and that is not incidental: the cards pin
 * with `position: sticky` under the header, so the header has to live in the
 * SAME scrollport as the cards. The page hands it in as `header`.
 *
 * The snap is MANDATORY, not proximity: every gesture has to land with a
 * card's top edge at the header, never half way — the feed reads like tabs
 * rather than like a scroll that happens to stick.
 *
 * The container carries the last card's bottom colour (the mock's `tailBg`)
 * so the page continues in the stack's own light instead of ending on a hard
 * edge against the background — and it repaints as pages are appended.
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

  const last = cards[cards.length - 1];
  const tail = last ? cardTailHex(hexesOfCard(last)) : "var(--bg)";

  return (
    <div
      className="bl-scroll box-border h-full overflow-x-hidden overflow-y-auto [scroll-snap-type:y_mandatory]"
      style={{
        background: tail,
        paddingBottom: "120px",
        scrollPaddingTop: `calc(${HDR_PX}px + env(safe-area-inset-top))`,
      }}
    >
      {header}
      <div className="flex flex-col">
        {cards.map((card, i) => (
          <Fragment key={card.kind === "burst" ? card.id : card.event.id}>
            {i === slot && pinned && <SuggestCard key={pinned.username} s={pinned} />}
            <FeedCardView card={card} />
          </Fragment>
        ))}
        {slot === cards.length && pinned && <SuggestCard key={pinned.username} s={pinned} />}
        {cursor && (
          <div className="flex justify-center px-5 pb-1 pt-3.5">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className="rounded-full px-6 py-3.5 text-[16px] font-semibold text-text-2 transition-opacity active:opacity-60 disabled:opacity-60"
            >
              {loading
                ? "Cargando…"
                : failed
                  ? "No se pudo cargar · Reintentar"
                  : "Ver más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
