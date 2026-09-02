"use client";

import { useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import { LoadMoreButton } from "@/components/ui";
import type { FeedCard } from "@/modules/social/types";
import { FeedCardView } from "./feed-card";

/**
 * F3.10 — the populated feed, as CARDS (v2). "Ver más" pages through the
 * server action with the keyset cursor the server re-encoded from the last
 * event the previous page consumed, so a burst never repeats, and only splits
 * when one run outgrows the whole chunk budget (see getFeedCards).
 *
 * A failed load keeps the cursor and SAYS so on the button: the route error
 * boundary would remount the list and drop every page already read, and a
 * silent retap is indistinguishable from the end of the feed.
 */
export function FeedList({
  initialCards,
  initialCursor,
}: {
  initialCards: FeedCard[];
  initialCursor: string | null;
}) {
  const [cards, setCards] = useState(initialCards);
  const [cursor, setCursor] = useState(initialCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

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
    <div className="flex flex-col gap-2 px-4">
      {cards.map((card) => (
        <FeedCardView key={card.kind === "burst" ? card.id : card.event.id} card={card} />
      ))}
      {cursor && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          label={failed ? "No se pudo cargar · Reintentar" : "Ver más"}
        />
      )}
    </div>
  );
}
