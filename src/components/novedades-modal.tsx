"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import {
  ANNOUNCEMENT_COPY,
  invitationCopy,
} from "@/modules/announcements";
import { dismissAnnouncementAction } from "@/app/actions/announcement-actions";
import type { ReviewInvitation } from "@/modules/reviews/queries";

/**
 * Novedades — the F3.9 announcement (reseñas), in the shape F3.8 established:
 * full-bleed cover, eyebrow, serif title, one paragraph, one action.
 *
 * What makes it concrete is the cover: it is a title THIS reader already
 * reacted to and never wrote about, so the sheet is never explaining a feature
 * in the abstract — it's pointing at a specific gap in their own library. The
 * page only renders this when such a title exists (`getReviewInvitation`);
 * otherwise the announcement stays unspent for another day.
 *
 * Both buttons dismiss. The primary one also walks them to the item page,
 * where the box is already open — the point of the sheet is not that they
 * acknowledge it, it's that they write something.
 */
export function NovedadesModal({
  invitation,
}: {
  invitation: ReviewInvitation;
}) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [, startTransition] = useTransition();

  if (closed) return null;

  // Dismissal is what spends the announcement — the sheet appearing is not
  // enough, since it can appear and be scrolled past by a reload.
  const spend = () => {
    setClosed(true);
    startTransition(() => {
      dismissAnnouncementAction().catch(() => {});
    });
  };

  // The dismissal is AWAITED before navigating, not fired alongside it: a
  // transition started and then interrupted by router.push can be dropped, and
  // the cost of dropping it is showing the same announcement again tomorrow to
  // the one person who did exactly what it asked. The sheet closes on the tap,
  // so the wait is invisible.
  const write = () => {
    setClosed(true);
    startTransition(async () => {
      await dismissAnnouncementAction().catch(() => {});
      router.push(`/item/${invitation.catalogItemId}`);
    });
  };

  return (
    <Sheet onClose={spend} variant="cover" label={ANNOUNCEMENT_COPY.title}>
      {/* Full-bleed cover, 1.25:1 — square album art is cropped top and bottom
          rather than letterboxed, the same frame F3.8 uses. */}
      <div className="relative aspect-[1.25] w-full overflow-hidden bg-surface-2">
        {invitation.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
          <img
            src={invitation.posterUrl}
            alt={`Portada de ${invitation.title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Neutral dark scrim so the type reads on any artwork (§7 exempts
            dark depth gradients; this is not a glow). */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.05) 42%, rgba(11,11,13,0.78) 100%)",
          }}
        />
        {/* Where F3.8 put a clock, this puts the title itself: the cover IS the
            example, so it has to be readable as one. */}
        <div className="absolute inset-x-0 bottom-0 p-[18px]">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/70">
            Ya reaccionaste
          </p>
          <p className="mt-1 font-serif text-[30px] italic leading-[1.02] text-text">
            {invitation.title}
          </p>
          {invitation.byline && (
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/60">
              {invitation.byline}
            </p>
          )}
        </div>
      </div>

      <div className="p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {ANNOUNCEMENT_COPY.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-[34px] italic leading-[1.04] text-text">
          {ANNOUNCEMENT_COPY.title}
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-text-2 [text-wrap:pretty]">
          {invitationCopy(invitation.count, invitation.title)}
        </p>
        <button
          type="button"
          onClick={write}
          className="mt-[18px] w-full rounded-full bg-accent px-6 py-[15px] text-base font-semibold text-bg transition-transform active:scale-[0.99]"
        >
          {ANNOUNCEMENT_COPY.cta}
        </button>
        <button
          type="button"
          onClick={spend}
          className="mt-2 w-full rounded-full px-6 py-3 text-[15px] font-semibold text-text-2 transition-colors hover:text-text"
        >
          {ANNOUNCEMENT_COPY.close}
        </button>
      </div>
    </Sheet>
  );
}
