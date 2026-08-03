"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { CountdownCover } from "@/components/countdown";
import {
  ANNOUNCEMENT_COPY,
  followedCopy,
  ownCopy,
  suggestionCopy,
} from "@/modules/announcements";
import {
  dismissAnnouncementAction,
  findFollowSuggestionAction,
  followSuggestionAction,
} from "@/app/actions/announcement-actions";
import type { FollowSuggestion } from "@/modules/backlog/follow-suggestion";

/**
 * Novedades — the F3.8 announcement, in the shape the design settled on (6b/6c).
 *
 * ONE form, two purposes: activate whoever has nothing pending, confirm whoever
 * already does. Which one you get is decided by your own backlog, never by a
 * flag, so the sheet always opens on something concrete:
 *
 * - 6c (`own`): titles of theirs are already counting. Nothing is offered —
 *   the cover is theirs, the clock is real, and the only action is closing.
 * - 6b (`suggest`): nothing of theirs is pending, so a real unreleased album by
 *   an artist they already have is offered, with "+ Seguir" ON the cover.
 *   Following doesn't close the sheet: the chip flips to SIGUIENDO and the copy
 *   confirms the date, so the reward is visible before they dismiss.
 *
 * The suggestion is fetched AFTER mount (it costs several iTunes round-trips),
 * so 6b appears a beat late rather than delaying /backlogs for everyone. If
 * there's nothing to suggest, the sheet never opens and the announcement stays
 * UNSPENT — better to say nothing today than to describe a feature abstractly.
 */
export function NovedadesModal({
  own,
  initialNow,
}: {
  /** The reader's own upcoming titles, when they have any (6c). */
  own: {
    count: number;
    title: string;
    byline: string | null;
    posterUrl: string | null;
    releaseDate: string;
  } | null;
  initialNow: number;
}) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [suggestion, setSuggestion] = useState<FollowSuggestion | null>(null);
  const [followed, setFollowed] = useState(false);
  const [, startTransition] = useTransition();

  // Which sheet this is, FROZEN at open. Following calls router.refresh(), which
  // re-renders the page and hands `own` back non-null (the album they just
  // followed is now theirs) — reading the live prop would flip 6b into 6c
  // mid-interaction, taking away the ✓ SIGUIENDO chip and the confirmation copy
  // at the exact moment they earned them.
  const [isOwn] = useState(() => Boolean(own));

  useEffect(() => {
    if (own) return; // 6c needs nothing fetched
    // Once per tab: without this, every /backlogs navigation by a user with no
    // suggestable artist would re-run five iTunes searches to conclude the same
    // nothing. The announcement stays unspent either way.
    if (sessionStorage.getItem("bl-novedades-tried")) return;
    sessionStorage.setItem("bl-novedades-tried", "1");
    let alive = true;
    findFollowSuggestionAction()
      .then((s) => {
        if (alive) setSuggestion(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [own]);

  if (closed) return null;

  const cover = isOwn ? own : suggestion;
  if (!cover) return null;

  const title = cover.title;
  const releaseDate = cover.releaseDate;

  const body =
    isOwn && own
      ? ownCopy(
          own.count,
          { byline: own.byline, releaseDate: own.releaseDate },
          initialNow,
        )
      : followed
        ? followedCopy(releaseDate, initialNow)
        : suggestionCopy(cover.byline);

  // Dismissal is what spends the announcement — the sheet appearing is not
  // enough, since it can appear and be scrolled past by a reload.
  const close = () => {
    setClosed(true);
    startTransition(() => {
      dismissAnnouncementAction().catch(() => {});
    });
  };

  return (
    <Sheet onClose={close} variant="cover" label={ANNOUNCEMENT_COPY.title}>
      {/* Full-bleed cover, 1.25:1 — square album art is cropped top and bottom
          rather than letterboxed, exactly as the mock frames it. */}
      <div className="relative aspect-[1.25] w-full overflow-hidden bg-surface-2">
        {cover.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
          <img
            src={cover.posterUrl}
            alt={`Portada de ${title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/* Neutral dark scrim so the clock reads on any artwork (§7 exempts
            dark depth gradients; this is not a glow). */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.05) 42%, rgba(11,11,13,0.78) 100%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end p-[18px]">
          <CountdownCover
            releaseDate={releaseDate}
            initialNow={initialNow}
            title={title}
          />
        </div>

        {/* 6b only: following lives ON the cover, where the content is, so the
            single action at the bottom stays "close" like every other sheet. */}
        {!isOwn && suggestion && (
          <button
            type="button"
            disabled={followed}
            onClick={() => {
              if (followed) return;
              startTransition(async () => {
                // The chip flips only once the write actually landed. Flipping
                // first and swallowing the outcome would promise "te avisamos
                // el 14 de agosto" for an album in no backlog — and the reader
                // would only find out by never getting the email.
                const res = await followSuggestionAction(
                  suggestion.catalogItemId,
                ).catch((err) => {
                  console.error("[F3.8] follow failed:", err);
                  return null;
                });
                if (!res || "error" in res) return;
                setFollowed(true);
                // Refresh so the "No puedo esperar" shelf is already there
                // when they close — the reward is behind the sheet, too.
                router.refresh();
              });
            }}
            className={
              followed
                ? "absolute right-3.5 top-3.5 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-4 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-bg"
                : "absolute right-3.5 top-3.5 inline-flex h-11 items-center gap-2 rounded-full bg-[rgba(11,11,13,0.86)] px-4 text-sm font-semibold text-text transition-colors active:bg-[rgba(11,11,13,0.96)]"
            }
          >
            {followed ? (
              <>✓ Siguiendo</>
            ) : (
              <>
                <span className="text-[17px] leading-none">+</span>Seguir
              </>
            )}
          </button>
        )}
      </div>

      <div className="p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {ANNOUNCEMENT_COPY.eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-[34px] italic leading-[1.04] text-text">
          {ANNOUNCEMENT_COPY.title}
        </h2>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-text-2 [text-wrap:pretty]">
          {body}
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-[18px] w-full rounded-full bg-accent px-6 py-[15px] text-base font-semibold text-bg transition-transform active:scale-[0.99]"
        >
          {ANNOUNCEMENT_COPY.close}
        </button>
      </div>
    </Sheet>
  );
}
