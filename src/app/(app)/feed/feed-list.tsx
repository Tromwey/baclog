"use client";

import { useState, useTransition } from "react";
import { loadMoreFeedAction } from "@/app/actions/social-actions";
import type { FeedEvent } from "@/modules/social/types";
import { FeedCard } from "./feed-card";

/**
 * F3.10 — the populated feed. "Ver más" pages through the server action with
 * the keyset cursor (same pattern as the reviews feed), so an event landing
 * mid-read can't shift or duplicate a card.
 */
export function FeedList({
  initialEvents,
  initialCursor,
}: {
  initialEvents: FeedEvent[];
  initialCursor: string | null;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      const page = await loadMoreFeedAction({ cursor });
      setEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="flex flex-col gap-2 px-4">
      {events.map((event) => (
        <FeedCard key={event.id} event={event} />
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
