"use client";

import { useState, useTransition, type ReactNode } from "react";
import { attempt } from "@/components/kura/attempt";
import { LoadMoreButton } from "@/components/ui";
import { KuraSheet } from "@/app/(app)/item/[catalogItemId]/kura-sheet";
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

/** How many pages one "Ver todas" pulls at most — a bound, not a design. */
const MAX_PAGES_PER_TAP = 5;

export interface ReviewPaging {
  hasMore: boolean;
  loading: boolean;
  /** The last "ver más" didn't arrive (the feed says so below the list and
   *  offers the retry); cleared by the next attempt. */
  failed: boolean;
  /** Loads the next page; with `renderHeader`, keeps going until the end.
   *  After a failure it retries the page that failed. */
  loadMore: () => void;
}

/**
 * F3.9 — everyone else's reviews of a title. Shared by the in-app block and the
 * anonymous public item page; the only difference is `canReport`, which the
 * public page turns off (an anonymous viewer can't act on anything, and a ⋯
 * that only says "regístrate" would be a trap — design decision).
 *
 * Paging is keyset through a server action, so a review published mid-read
 * can't duplicate a card. Two shapes of the same list:
 *  - default: the list, then a "Ver más reseñas" button (public page).
 *  - `renderHeader`: the caller draws the header (the Revamp UI's
 *    "Reseñas · 38 · Ver todas") from the paging state and pins its own card
 *    (`pinned`) between the header and the list; "Ver todas" then drains the
 *    remaining pages instead of one at a time.
 */
export function ReviewFeed({
  catalogItemId,
  initialReviews,
  initialCursor,
  canReport,
  allowSpoiler,
  excludeUsername,
  emptyNote,
  renderHeader,
  pinned,
}: {
  catalogItemId: string;
  initialReviews: FeedReview[];
  initialCursor: string | null;
  canReport: boolean;
  /**
   * False on albums: with no spoiler switch to forget, "Spoiler sin marcar"
   * can't be a real complaint — leaving it in the sheet would ask people to
   * report a rule the product never applied here.
   */
  allowSpoiler: boolean;
  /** Handle whose review is pinned above — kept out of every page loaded here. */
  excludeUsername?: string;
  emptyNote?: ReactNode;
  renderHeader?: (paging: ReviewPaging) => ReactNode;
  pinned?: ReactNode;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [cursor, setCursor] = useState(initialCursor);
  const [reported, setReported] = useState<Record<string, true>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [failed, setFailed] = useState(false);
  const [, startReport] = useTransition();
  const [reportFailed, setReportFailed] = useState(false);

  function loadMore() {
    if (!cursor) return;
    const drain = renderHeader !== undefined;
    setFailed(false);
    startLoading(async () => {
      let next: string | null = cursor;
      let pages = 0;
      do {
        const at: string = next;
        const res = await attempt(() =>
          loadMoreReviewsAction({ catalogItemId, cursor: at, excludeUsername }),
        );
        if (!res.ok) {
          // A page that didn't arrive keeps what already loaded and leaves
          // the cursor ON it: the note below says so and the retry asks for
          // that same page (never a silent stop that reads as "no hay más").
          setFailed(true);
          break;
        }
        const page = res.value;
        setReviews((prev) => [...prev, ...page.reviews]);
        next = page.nextCursor;
        pages += 1;
      } while (drain && next && pages < MAX_PAGES_PER_TAP);
      setCursor(next);
    });
  }

  function report(reason: ReviewReportReason) {
    const reviewId = target;
    if (!reviewId) return;
    setTarget(null);
    // Local to this session: for everyone else the review is still there until
    // an admin hides it. The acknowledgement is immediate either way.
    setReported((prev) => ({ ...prev, [reviewId]: true }));
    setReportFailed(false);
    startReport(async () => {
      // The acknowledgement is optimistic; a report that never reached the
      // server must not stay "reportada" — the card comes back and says so.
      const res = await attempt(() => reportReviewAction({ reviewId, reason }));
      if (res.ok) return;
      setReported((prev) => {
        const rest = { ...prev };
        delete rest[reviewId];
        return rest;
      });
      setReportFailed(true);
    });
  }

  const list =
    reviews.length === 0 ? (
      emptyNote
    ) : (
      <div className="flex flex-col gap-3">
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
              displayName={`@${review.author.username}`}
              menuLabel="Reportar reseña"
              onMenu={canReport ? () => setTarget(review.id) : undefined}
            />
          ),
        )}
      </div>
    );

  return (
    <>
      {renderHeader?.({ hasMore: cursor !== null, loading, failed, loadMore })}
      {pinned}
      {list}

      {reportFailed && (
        <p role="alert" className="mt-[10px] text-[14px] leading-[1.4] text-text-2">
          No se envió tu reporte. Revisa tu conexión y vuelve a intentarlo.
        </p>
      )}

      {failed && cursor && (
        <p role="status" className="mt-[10px] text-[14px] leading-[1.4] text-text-2">
          No se cargó el resto.
          {renderHeader && (
            <>
              {" "}
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="font-medium text-text underline underline-offset-2 transition-opacity active:opacity-60 disabled:opacity-50"
              >
                Reintentar
              </button>
            </>
          )}
        </p>
      )}

      {!renderHeader && cursor && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loading}
          label={failed ? "Reintentar" : "Ver más reseñas"}
          className="mt-[10px]"
        />
      )}

      {target && (
        <KuraSheet onClose={() => setTarget(null)} label="Reportar reseña" className="px-5">
          <h2 className="pb-2 pt-1 font-brand text-[22px] leading-[1.1] text-text">
            ¿qué pasa con esta reseña?
          </h2>
          <div className="flex flex-col">
            {REVIEW_REPORT_REASONS.filter(
              (reason) => allowSpoiler || reason.id !== "unmarked_spoiler",
            ).map((reason) => (
              <button
                key={reason.id}
                onClick={() => report(reason.id)}
                className="flex min-h-[52px] w-full items-center text-left text-[16px] font-medium text-text transition-opacity active:opacity-60"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </KuraSheet>
      )}
    </>
  );
}
