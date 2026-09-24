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
    <section className="flex flex-col gap-3 px-6">
      {/* Kura (2026-09-24): the section title in Newsreader 24, lowercase,
          with the count in mono at the right — like every other section of
          the public profile. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-brand text-[24px] leading-[1.1] text-text">
          lo que dice {displayName.toLowerCase()}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{reviews.length}</span>
      </div>
      {reviews.map((review) => (
        <div
          key={review.id}
          className="flex flex-col gap-2.5 rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${username}/item/${review.catalogItemId}`}
              className="min-w-0 truncate font-brand text-[19px] italic leading-[1.1] text-text transition-opacity active:opacity-60"
            >
              {review.title}
            </Link>
            <span className="flex items-center">
              <MarkGlyph mark={review.mark} />
            </span>
            <span className="ml-auto flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              {review.when}
            </span>
          </div>
          <SpoilerBody body={review.body} hasSpoiler={review.hasSpoiler} />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            {review.mediaTypeLabel}
          </span>
        </div>
      ))}
    </section>
  );
}
