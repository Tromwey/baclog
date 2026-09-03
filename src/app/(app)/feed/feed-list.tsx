"use client";

import { Fragment, useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import { LoadMoreButton } from "@/components/ui";
import type { FeedCard, FeedSuggestion } from "@/modules/social/types";
import { FeedCardView } from "./feed-card";
import { SuggestCard } from "./suggest-card";

/**
 * F3.10 — the populated feed, as CARDS (v3: surfaceless, 36px apart).
 * "Ver más" pages through the server action with the keyset cursor the
 * server re-encoded from the last event the previous page consumed, so a
 * burst never repeats, and only splits when one run outgrows the whole chunk
 * budget (see getFeedCards).
 *
 * The suggestion is not a card of the feed: it sits at a fixed slot of the
 * FIRST page (after the second card — past the gems that lead the page,
 * before the reader has to scroll for it) and never moves when more pages
 * arrive. A page shorter than that slot shows it last.
 *
 * It is PINNED at mount, like the cards: following someone revalidates
 * /feed, the server re-renders the page and getFeedSuggestion now offers the
 * NEXT person — and rendering that new prop in the same slot swapped the
 * card under a FollowButton that still held "Siguiendo" for the previous
 * one (founder report, 2026-09-02). The person you just followed stays,
 * saying Siguiendo, until the next visit. The key on the card is the belt
 * to that suspender: a different person can never inherit the pill's state.
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
}: {
  initialCards: FeedCard[];
  initialCursor: string | null;
  suggestion: FeedSuggestion | null;
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

  return (
    <div className="flex flex-col gap-9 pt-1.5">
      {cards.map((card, i) => (
        <Fragment key={card.kind === "burst" ? card.id : card.event.id}>
          {i === slot && pinned && <SuggestCard key={pinned.username} s={pinned} />}
          <FeedCardView card={card} />
        </Fragment>
      ))}
      {slot === cards.length && pinned && <SuggestCard key={pinned.username} s={pinned} />}
      {cursor && (
        <div className="flex justify-center px-5 pt-1">
          <LoadMoreButton
            onClick={loadMore}
            loading={loading}
            variant="pill"
            label={failed ? "No se pudo cargar · Reintentar" : "Ver más"}
          />
        </div>
      )}
    </div>
  );
}
