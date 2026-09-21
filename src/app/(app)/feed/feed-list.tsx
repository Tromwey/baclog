"use client";

import { Fragment, useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import { LoadMoreButton } from "@/components/ui";
import type { FeedCard, FeedSuggestion } from "@/modules/social/types";
import { FeedCardView, isGemCard } from "./feed-card";
import { SuggestCard } from "./suggest-card";

/**
 * F3.10 — the populated feed, as CARDS (v3: surfaceless, spaced by the
 * frame's four-case rhythm rather than one flat gap — see the map below).
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

  // One flat run, suggestion included: the frame's rhythm is computed over
  // whatever actually renders, and the suggestion takes part in it.
  const rows: { key: string; isGem: boolean; card: FeedCard | null }[] = [];
  cards.forEach((card, i) => {
    if (i === slot && pinned) rows.push({ key: `s:${pinned.username}`, isGem: false, card: null });
    rows.push({
      key: card.kind === "burst" ? card.id : card.event.id,
      isGem: isGemCard(card),
      card,
    });
  });
  if (slot === cards.length && pinned)
    rows.push({ key: `s:${pinned.username}`, isGem: false, card: null });

  return (
    <div className="flex flex-col pt-1.5">
      {rows.map((r, i) => {
        const prev = i > 0 ? rows[i - 1] : null;
        const next = i + 1 < rows.length ? rows[i + 1] : null;
        // The frame's four cases: heroes breathe (72 between two of them,
        // 56 before one), the card after a hero tucks in (28), everything
        // else sits at 36. A single flat gap flattens the whole feed.
        const gap = !prev ? 0 : prev.isGem && r.isGem ? 72 : prev.isGem ? 28 : r.isGem ? 56 : 36;
        return (
          <Fragment key={r.key}>
            {gap > 0 && <div aria-hidden style={{ height: `${gap}px` }} />}
            {r.card === null && pinned ? (
              <SuggestCard key={pinned.username} s={pinned} />
            ) : (
              r.card && (
                <FeedCardView
                  card={r.card}
                  ctx={{
                    nextIsGem: next ? next.isGem : null,
                    followsHero: !!prev && prev.isGem && r.isGem,
                    followsOther: !!prev && !prev.isGem && r.isGem,
                  }}
                />
              )
            )}
          </Fragment>
        );
      })}
      {cursor && (
        <div className="flex justify-center px-5 pt-9">
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
