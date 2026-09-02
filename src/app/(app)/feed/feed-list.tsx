"use client";

import { useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import type { FeedCard } from "@/modules/social/types";
import { FeedCardView } from "./feed-card";

/**
 * F3.10 — the populated feed, as CARDS (v2). "Ver más" pages through the
 * server action with the keyset cursor the server re-encoded from the last
 * event the previous page consumed, so a burst never repeats or splits.
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
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      try {
        const page = await loadMoreFeedAction({ cursor });
        setCards((prev) => [...prev, ...page.cards]);
        setCursor(page.nextCursor);
      } catch {
        // Keep the cursor: the button stays, a retap retries.
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 px-4">
      {cards.map((card) => (
        <FeedCardView key={card.kind === "burst" ? card.id : card.event.id} card={card} />
      ))}
      {cursor && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="block w-full rounded-[14px] bg-surface-2 py-[13px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-opacity disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Ver más"}
        </button>
      )}
    </div>
  );
}
