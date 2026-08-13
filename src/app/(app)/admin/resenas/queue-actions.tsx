"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  dismissReviewReportsAction,
  hideReviewAction,
  restoreReviewAction,
} from "@/app/actions/review-moderation-actions";

/**
 * F3.9 — the queue's two (and only two) actions, and neither is destructive:
 * OCULTAR is reversible with RESTAURAR from this same list, and DESCARTAR
 * closes the reports leaving the review exactly where it was. There is no
 * delete on this screen — deleting a review is the author's alone.
 */
export function QueueActions({
  reviewId,
  hidden,
}: {
  reviewId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  const run = (fn: (id: string) => Promise<unknown>) => () =>
    start(async () => {
      await fn(reviewId);
      router.refresh();
    });

  const primary =
    "rounded-full bg-surface-2 px-[15px] py-[9px] font-mono text-[11px] tracking-[0.06em] text-text transition-opacity disabled:opacity-50";
  const ghost =
    "rounded-full px-[15px] py-[9px] font-mono text-[11px] tracking-[0.06em] text-text-3 transition-opacity disabled:opacity-50";

  if (hidden) {
    return (
      <div className="mt-[13px] flex gap-2">
        <button
          onClick={run(restoreReviewAction)}
          disabled={busy}
          className={primary}
        >
          RESTAURAR
        </button>
      </div>
    );
  }

  return (
    <div className="mt-[13px] flex gap-2">
      <button
        onClick={run(hideReviewAction)}
        disabled={busy}
        className={primary}
      >
        OCULTAR
      </button>
      <button
        onClick={run(dismissReviewReportsAction)}
        disabled={busy}
        className={ghost}
      >
        DESCARTAR
      </button>
    </div>
  );
}
