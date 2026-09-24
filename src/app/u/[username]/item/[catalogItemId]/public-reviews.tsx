"use client";

import { useState, useTransition } from "react";
import { loadMoreReviewsAction } from "@/app/actions/review-actions";
import { ReviewCard } from "@/components/reviews/review-card";
import { markLabel } from "@/modules/reviews/format";
import type { FeedReview } from "@/modules/reviews/types";

/**
 * "reseñas" on the anonymous item page (Kura 24a: the section title in
 * Newsreader 24 with the count in mono at the right), then the review
 * cards. The profile owner's review — the reason this link was sent — is
 * simply the FIRST card (the old "Lo que dice X" block folded into the list);
 * every page loaded after excludes their handle so it never repeats.
 *
 * "Ver todas" pages through the keyset cursor until it runs out, then
 * disappears. No ⋯ anywhere: an anonymous viewer can neither report nor edit,
 * and a menu whose only entry is "regístrate" would be a trap. Spoilers ARE
 * covered for them — this is where it matters most.
 */
export function PublicReviews({
  catalogItemId,
  count,
  pinned,
  initialReviews,
  initialCursor,
  excludeUsername,
}: {
  catalogItemId: string;
  count: number;
  pinned: FeedReview | null;
  initialReviews: FeedReview[];
  initialCursor: string | null;
  excludeUsername: string;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, startLoading] = useTransition();

  function loadAll() {
    if (!cursor) return;
    startLoading(async () => {
      const page = await loadMoreReviewsAction({
        catalogItemId,
        cursor,
        excludeUsername,
      });
      setReviews((prev) => [...prev, ...page.reviews]);
      setCursor(page.nextCursor);
    });
  }

  const all = pinned ? [pinned, ...reviews] : reviews;
  if (all.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-brand text-[24px] leading-[1.1] text-text">reseñas</h2>
        {cursor ? (
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60 disabled:opacity-60"
          >
            {loading ? "Cargando…" : `Ver las ${count} reseñas`}
          </button>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{count}</span>
        )}
      </div>
      {all.map((review) => (
        <ReviewCard
          key={review.id}
          body={review.body}
          hasSpoiler={review.hasSpoiler}
          mark={review.mark}
          when={review.when}
          author={review.author}
          markLabel={markLabel(review.mark)}
          displayName={`@${review.author.username}`}
        />
      ))}
    </section>
  );
}
