"use client";

import Link from "next/link";
import type { ProfileReview } from "@/modules/reviews/types";
import { MarkGlyph, SpoilerBody } from "./review-card";

/**
 * F3.9 — "Lo que dice X" on the public profile, in the Revamp UI's review
 * card (2026-09-03): the same glass card as everywhere else (radius 18, the
 * borderless glass fill, 14/16 padding, 10 gap, the reaction as a glyph, the
 * date right-aligned in mono, the body at 15/1.5). Here the PERSON is the
 * constant and the title is the variable, so the title takes the byline slot
 * in serif italic and links to the public item page; the handle is at the
 * top of the profile already. Only rendered for a public profile that has at
 * least one review.
 */
export function ProfileReviews({
  username,
  displayName,
  reviews,
}: {
  username: string;
  displayName: string;
  reviews: ProfileReview[];
}) {
  if (reviews.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 px-6 pt-[26px]">
      <div className="flex items-baseline gap-2">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
          Lo que dice {displayName} · {reviews.length}
        </h2>
      </div>
      {reviews.map((review) => (
        <div
          key={review.id}
          className="flex flex-col gap-2.5 rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${username}/item/${review.catalogItemId}`}
              className="min-w-0 truncate font-serif text-[19px] italic leading-[1.1] text-text"
            >
              {review.title}
            </Link>
            <span className="flex items-center">
              <MarkGlyph mark={review.mark} />
            </span>
            <span className="ml-auto flex-none font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
              {review.when}
            </span>
          </div>
          <SpoilerBody body={review.body} hasSpoiler={review.hasSpoiler} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
            {review.mediaTypeLabel}
          </span>
        </div>
      ))}
    </section>
  );
}
