"use client";

import Link from "next/link";
import { markLabel } from "@/modules/reviews/format";
import type { ProfileReview } from "@/modules/reviews/types";
import { MarkGlyph, SpoilerBody } from "./review-card";

/**
 * F3.9 — "Lo que dice X" on the public profile. Here the PERSON is the constant
 * and the title is the variable, so the card turns over: the title takes the
 * serif italic lead and the username disappears entirely (it's at the top of
 * the page, on the profile itself). Only rendered for a public profile that has
 * at least one review.
 */
export function ProfileReviews({
  username,
  reviews,
}: {
  username: string;
  reviews: ProfileReview[];
}) {
  if (reviews.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-[18px] h-px bg-line" />
      <div className="mb-[14px] flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
          Lo que dice {username}
        </span>
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-3">
          {reviews.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {reviews.map((review) => (
          <div
            key={review.id}
            className="rounded-[18px] bg-surface-1 px-4 pb-4 pt-[15px]"
          >
            <div className="flex items-baseline gap-2">
              <Link
                href={`/${username}/item/${review.catalogItemId}`}
                className="font-serif text-[21px] italic leading-[1.15] text-text"
              >
                {review.title}
              </Link>
              <MarkGlyph mark={review.mark} />
            </div>
            <SpoilerBody
              body={review.body}
              hasSpoiler={review.hasSpoiler}
              className="mt-[9px]"
            />
            <p className="mt-[9px] font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
              {[review.mediaTypeLabel, markLabel(review.mark), review.when]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
