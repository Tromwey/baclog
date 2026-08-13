"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui";
import {
  loadMoreReviewsAction,
  reportReviewAction,
} from "@/app/actions/review-actions";
import { markLabel } from "@/modules/reviews/format";
import {
  REVIEW_REPORT_REASONS,
  type FeedReview,
  type ReviewReportReason,
} from "@/modules/reviews/types";
import { ReportedCard, ReviewCard } from "./review-card";

/**
 * F3.9 — everyone else's reviews of a title. Shared by the in-app block and the
 * anonymous public item page; the only difference is `canReport`, which the
 * public page turns off (an anonymous viewer can't act on anything, and a ⋯
 * that only says "regístrate" would be a trap — design decision).
 *
 * "Ver más" pages through a server action with the keyset cursor, so a review
 * published mid-read can't duplicate a card.
 */
export function ReviewFeed({
  catalogItemId,
  initialReviews,
  initialCursor,
  canReport,
  excludeUsername,
  emptyNote,
}: {
  catalogItemId: string;
  initialReviews: FeedReview[];
  initialCursor: string | null;
  canReport: boolean;
  /** Handle whose review is pinned above — kept out of every page loaded here. */
  excludeUsername?: string;
  emptyNote?: React.ReactNode;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [cursor, setCursor] = useState(initialCursor);
  const [reported, setReported] = useState<Record<string, true>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [, startReport] = useTransition();

  function loadMore() {
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

  function report(reason: ReviewReportReason) {
    const reviewId = target;
    if (!reviewId) return;
    setTarget(null);
    // Local to this session: for everyone else the review is still there until
    // an admin hides it. The acknowledgement is immediate either way.
    setReported((prev) => ({ ...prev, [reviewId]: true }));
    startReport(() => {
      void reportReviewAction({ reviewId, reason });
    });
  }

  if (reviews.length === 0) return <>{emptyNote}</>;

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        {reviews.map((review) =>
          reported[review.id] ? (
            <ReportedCard key={review.id} />
          ) : (
            <ReviewCard
              key={review.id}
              body={review.body}
              hasSpoiler={review.hasSpoiler}
              mark={review.mark}
              when={review.when}
              author={review.author}
              markLabel={markLabel(review.mark)}
              displayName={review.author.username}
              menuLabel="Reportar reseña"
              onMenu={canReport ? () => setTarget(review.id) : undefined}
            />
          ),
        )}
      </div>

      {cursor && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-[10px] block w-full rounded-[14px] bg-surface-2 py-[13px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-opacity disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Ver más reseñas"}
        </button>
      )}

      {target && (
        <Sheet onClose={() => setTarget(null)} label="Reportar reseña">
          <div className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
            ¿Qué pasa con esta reseña?
          </div>
          <div className="mt-[14px] flex flex-col gap-2">
            {REVIEW_REPORT_REASONS.map((reason) => (
              <button
                key={reason.id}
                onClick={() => report(reason.id)}
                className="w-full rounded-[14px] bg-surface-2 px-4 py-[13px] text-left text-sm text-text transition-colors hover:bg-surface-3"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
