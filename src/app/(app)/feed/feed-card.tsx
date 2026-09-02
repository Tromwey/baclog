"use client";

import Link from "next/link";
import { AdnAvatar } from "@/components/adn-avatar";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { MarkGlyph, SpoilerBody } from "@/components/reviews/review-card";
import { markLabel } from "@/modules/reviews/format";
import type { FeedEvent } from "@/modules/social/types";

/**
 * F3.10 — one activity card, five flavors (design 1k). All five share the same
 * skeleton so the feed reads as one object: person header (24px ADN orb +
 * @handle + relative time), then cover + three brightness tiers in a fixed
 * order — verb in text-2, work in serif italic 21 at full text, metadata in
 * mono 8 text-3. The flame is the ONLY color in the feed; the verdict travels
 * only on Completó / Reseñó, as a dot at the metadata tier, never above it.
 *
 * "No puede esperar" is not a kind of its own: it's an `added` card whose
 * title is still unreleased (`waiting`), so it relabels itself on release day
 * with zero cleanup.
 */
export function FeedCard({ event }: { event: FeedEvent }) {
  const profileHref = `/u/${event.author.username}`;
  // Straight to the viewer's OWN item page: the feed is a signed-in surface,
  // and the public item page now redirects sessions there anyway — linking
  // through it would just add a server hop per tap.
  const itemHref = `/item/${event.catalogItemId}`;
  const isAlbum = event.mediaType === "album";
  // Server contract: `waiting` is only ever set on `added` events (queries.ts).
  const waiting = event.waiting;

  return (
    <article className="flex flex-col gap-[10px] rounded-[18px] bg-surface-1 px-3.5 pb-3.5 pt-3">
      <div className="flex items-center gap-[9px]">
        <Link
          href={profileHref}
          className="flex min-w-0 items-center gap-[9px]"
        >
          <AdnAvatar
            hexes={event.author.avatarHexes}
            initial={event.author.initial}
            className="h-6 w-6 text-[9px]"
          />
          <span className="truncate text-[13.5px] font-semibold text-text">
            @{event.author.username}
          </span>
        </Link>
        <span className="ml-auto flex-none font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
          {event.when}
        </span>
      </div>

      <Link href={itemHref} className="flex gap-3">
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
          <img
            src={event.posterUrl}
            alt=""
            className={`w-11 flex-none rounded-lg object-cover ${
              isAlbum ? "h-11" : "h-[66px]"
            }`}
          />
        ) : (
          <span
            aria-hidden
            className={`flex w-11 flex-none items-center justify-center rounded-lg bg-surface-2 text-text-3 ${
              isAlbum ? "h-11" : "h-[66px]"
            }`}
          >
            {isAlbum ? "♫" : "▸"}
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-1">
          <VerbLine event={event} waiting={waiting} />
          <span className="font-serif text-[21px] italic leading-[1.12] text-text">
            {event.title}
          </span>
          <MetaLine event={event} waiting={waiting} />
        </span>
      </Link>

      {event.kind === "reviewed" && event.reviewBody !== null && (
        <SpoilerBody
          body={event.reviewBody}
          hasSpoiler={event.hasSpoiler}
          className=""
        />
      )}
    </article>
  );
}

function VerbLine({
  event,
  waiting,
}: {
  event: FeedEvent;
  waiting: string | null;
}) {
  if (event.kind === "obsessed") {
    return (
      <span className="flex items-center gap-[5px] text-[12.5px] leading-[1.3] text-hot">
        <svg
          width="11"
          height="11"
          viewBox={GLYPH_VIEWBOX}
          fill="var(--hot)"
          aria-hidden
          className="flex-none"
        >
          <path d={FLAME_PATH} />
        </svg>
        Le obsesiona
      </span>
    );
  }

  if (event.kind === "added") {
    if (waiting) {
      return (
        <span className="text-[12.5px] leading-[1.3] text-text-2">
          No puede esperar
        </span>
      );
    }
    return (
      <span className="text-[12.5px] leading-[1.3] text-text-2">
        Agregó{event.backlogName ? " a " : ""}
        {event.backlogName && (
          <span className="font-semibold text-text">{event.backlogName}</span>
        )}
      </span>
    );
  }

  return (
    <span className="text-[12.5px] leading-[1.3] text-text-2">
      {event.kind === "completed" ? "Completó" : "Reseñó"}
    </span>
  );
}

function MetaLine({
  event,
  waiting,
}: {
  event: FeedEvent;
  waiting: string | null;
}) {
  if (waiting) {
    return (
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
        {event.mediaTypeLabel} · <span className="text-text-2">{waiting}</span>
      </span>
    );
  }

  if (event.mark) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
        <MarkGlyph mark={event.mark} />
        {event.mediaTypeLabel} · {markLabel(event.mark)}
      </span>
    );
  }

  // At rest: type + year for video, type + artist for an album (design 1a).
  const tail = event.mediaType === "album" ? event.byline : event.year;
  return (
    <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
      {event.mediaTypeLabel}
      {tail !== null && tail !== undefined ? ` · ${tail}` : ""}
    </span>
  );
}
