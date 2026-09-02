"use client";

import Link from "next/link";
import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { MarkGlyph, SpoilerBody } from "@/components/reviews/review-card";
import { markLabel } from "@/modules/reviews/format";
import type { FeedBurst, FeedCard, FeedEvent } from "@/modules/social/types";
import type { ReviewAuthor } from "@/modules/reviews/types";

/**
 * Feed v2 (design "Feed poblado v2" → Feed.dc.html, 2026-09-02) — FOUR card
 * shapes at two densities, picked from the data:
 *
 *  - BURST   — N consecutive adds by one author to one backlog: header, one
 *              sentence ("Agregó 8 títulos a 2026"), a scrolling strip of
 *              64px covers, the per-type tally, and "Ver los N" that expands
 *              the rows in place (the mock's chosen 1b: expand, don't leave).
 *  - GEM     — obsessed (flame + serif 27) and reviewed (serif 23 + body):
 *              the rare, precious events get the room and the color.
 *  - COMPACT — a lone add, a "no puede esperar", a completion: one row,
 *              handle + verb on a single line, small cover on the right.
 *
 * Shared header on burst/gem: 24px ADN orb with initial + @handle + relative
 * time. The flame stays the only color; verdicts stay at the metadata tier.
 * Every cover keeps its native aspect (album 1:1, video 2:3) — never cropped.
 */

export function FeedCardView({ card }: { card: FeedCard }) {
  if (card.kind === "burst") return <BurstCard burst={card} />;
  const e = card.event;
  if (e.kind === "obsessed") return <ObsessedCard event={e} />;
  if (e.kind === "reviewed") return <ReviewedCard event={e} />;
  return <CompactCard event={e} />;
}

// ---------- shared bits ----------

function Header({ author, when }: { author: ReviewAuthor; when: string }) {
  return (
    <div className="flex items-center gap-[9px]">
      <Link href={`/u/${author.username}`} className="flex min-w-0 items-center gap-[9px]">
        <AdnAvatar hexes={author.avatarHexes} initial={author.initial} className="h-6 w-6 text-[9px]" />
        <span className="truncate text-[13.5px] font-semibold text-text">@{author.username}</span>
      </Link>
      <span className="ml-auto flex-none font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
        {when}
      </span>
    </div>
  );
}

/** A cover at a given WIDTH; height follows the native aspect. */
function Cover({
  event,
  w,
  album,
  video,
  radius,
}: {
  event: FeedEvent;
  w: string;
  album: string;
  video: string;
  radius: string;
}) {
  const h = event.mediaType === "album" ? album : video;
  if (event.posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
      <img src={event.posterUrl} alt="" className={`${w} ${h} ${radius} flex-none object-cover`} />
    );
  }
  return (
    <span aria-hidden className={`${w} ${h} ${radius} flex flex-none items-center justify-center bg-surface-2 text-text-3`}>
      {event.mediaType === "album" ? "♫" : "▸"}
    </span>
  );
}

/** "Película · 2023" / "Álbum · Charli xcx" / with mark or countdown. */
function metaOf(event: FeedEvent): string {
  if (event.waiting) return `${event.mediaTypeLabel} · ${event.waiting}`;
  if (event.mark) return `${event.mediaTypeLabel} · ${markLabel(event.mark)}`;
  const tail = event.mediaType === "album" ? event.byline : event.year;
  return tail !== null && tail !== undefined ? `${event.mediaTypeLabel} · ${tail}` : event.mediaTypeLabel;
}

const META = "font-mono text-[8px] uppercase tracking-[0.1em] text-text-3";

// ---------- burst ----------

function BurstCard({ burst }: { burst: FeedBurst }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="flex flex-col gap-[10px] rounded-[18px] bg-surface-1 px-3.5 py-3">
      <Header author={burst.author} when={burst.when} />
      <div className="text-[12.5px] leading-[1.3] text-text-2">
        Agregó <b className="font-semibold text-text">{burst.count} títulos</b> a{" "}
        <b className="font-semibold text-text">{burst.backlogName}</b>
      </div>
      <div className="-mx-3.5 flex items-end gap-1.5 overflow-x-auto px-3.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {burst.items.map((e) => (
          <Link key={e.id} href={`/item/${e.catalogItemId}`} className="flex-none">
            <Cover event={e} w="w-16" album="h-16" video="h-24" radius="rounded-[10px]" />
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2.5">
        <span className={META}>{burst.typeCounts}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto py-1.5 pl-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-2 transition-colors hover:text-text"
        >
          {expanded ? "Ocultar" : `Ver los ${burst.count}`}
        </button>
      </div>
      {expanded && (
        <div className="bl-rise flex flex-col gap-1.5 rounded-[12px] bg-surface-2 px-2.5 py-2">
          {burst.items.map((e) => (
            <Link key={e.id} href={`/item/${e.catalogItemId}`} className="flex items-center gap-2.5 py-[3px]">
              <Cover event={e} w="w-7" album="h-7" video="h-[42px]" radius="rounded-[5px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-serif text-base italic leading-[1.12] text-text">{e.title}</span>
                <span className={META}>{metaOf(e)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

// ---------- gems ----------

function ObsessedCard({ event }: { event: FeedEvent }) {
  return (
    <article className="flex flex-col gap-3 rounded-[18px] bg-surface-1 px-3.5 pb-4 pt-3.5">
      <Header author={event.author} when={event.when} />
      <Link href={`/item/${event.catalogItemId}`} className="flex items-start gap-3.5">
        <Cover event={event} w="w-16" album="h-16" video="h-24" radius="rounded-[10px]" />
        <span className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <span className="flex items-center gap-1.5 text-[13px] leading-[1.3] text-hot">
            <svg width="13" height="13" viewBox={GLYPH_VIEWBOX} fill="var(--hot)" aria-hidden className="flex-none">
              <path d={FLAME_PATH} />
            </svg>
            Le obsesiona
          </span>
          <span className="font-serif text-[27px] italic leading-[1.08] text-pretty text-text">{event.title}</span>
          <span className={META}>{metaOf({ ...event, mark: null })}</span>
        </span>
      </Link>
    </article>
  );
}

function ReviewedCard({ event }: { event: FeedEvent }) {
  return (
    <article className="flex flex-col gap-3 rounded-[18px] bg-surface-1 px-3.5 pb-4 pt-3.5">
      <Header author={event.author} when={event.when} />
      <Link href={`/item/${event.catalogItemId}`} className="flex items-start gap-3">
        <Cover event={event} w="w-[52px]" album="h-[52px]" video="h-[78px]" radius="rounded-[9px]" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[12.5px] leading-[1.3] text-text-2">Reseñó</span>
          <span className="font-serif text-[23px] italic leading-[1.1] text-pretty text-text">{event.title}</span>
          <span className={`flex items-center gap-1.5 ${META}`}>
            <MarkGlyph mark={event.mark} />
            {metaOf(event)}
          </span>
        </span>
      </Link>
      {event.reviewBody !== null && (
        <SpoilerBody body={event.reviewBody} hasSpoiler={event.hasSpoiler} className="" />
      )}
    </article>
  );
}

// ---------- compact ----------

function CompactCard({ event }: { event: FeedEvent }) {
  const verb =
    event.kind === "completed" ? "completó" : event.waiting ? "no puede esperar" : "agregó a";
  const named = event.kind === "added" && !event.waiting && event.backlogName;
  return (
    <Link
      href={`/item/${event.catalogItemId}`}
      className="flex items-center gap-2.5 rounded-[14px] bg-surface-1 px-3 py-2.5"
    >
      <AdnAvatar hexes={event.author.avatarHexes} className="mt-px h-[18px] w-[18px] self-start" />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-baseline gap-[5px] text-[12.5px] leading-[1.3] text-text-2">
          <b className="flex-none font-semibold text-text">@{event.author.username}</b>
          <span className="truncate">
            {verb}
            {named && (
              <>
                {" "}
                <b className="font-semibold text-text">{event.backlogName}</b>
              </>
            )}
          </span>
          <span className="ml-auto flex-none font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
            {event.when}
          </span>
        </span>
        <span className="font-serif text-[17.5px] italic leading-[1.12] text-pretty text-text">{event.title}</span>
        <span className={`flex items-center gap-1.5 ${META}`}>
          {event.kind === "completed" && <MarkGlyph mark={event.mark} />}
          {metaOf(event)}
        </span>
      </span>
      <Cover event={event} w="w-8" album="h-8" video="h-12" radius="rounded-md" />
    </Link>
  );
}
