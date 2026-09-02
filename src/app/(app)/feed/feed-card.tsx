"use client";

import Link from "next/link";
import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { CoverThumb } from "@/components/cover-thumb";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { MarkGlyph, SpoilerBody } from "@/components/reviews/review-card";
import { joinMeta } from "@/lib/format";
import { markLabel } from "@/modules/reviews/format";
import type { FeedBurst, FeedCard, FeedEvent } from "@/modules/social/types";
import type { ReviewAuthor } from "@/modules/reviews/types";

/**
 * Feed v2 (design "Feed poblado v2" → Feed.dc.html, 2026-09-02) — FOUR card
 * shapes at two densities, picked from the data:
 *
 *  - BURST   — N consecutive adds by one author to one backlog: header, one
 *              sentence ("Agregó 8 títulos a 2026"), a scrolling strip of
 *              64px covers (capped at STRIP_MAX, then a "+N" tile), the
 *              per-type tally, and "Ver los N" that expands the rows in place
 *              (the mock's chosen 1b: expand, don't leave).
 *  - GEM     — obsessed (flame + serif 27) and reviewed (serif 23 + body):
 *              the rare, precious events get the room and the color.
 *  - COMPACT — a lone add, a "no puede esperar", a completion: one row,
 *              handle + verb on a single line, small cover on the right.
 *
 * Shared header on burst/gem: 24px ADN orb with initial + @handle + relative
 * time. Every card links its @handle to the profile and its title to the
 * item — the compact row does it with a stretched item link under a raised
 * handle link, never nested anchors. The flame stays the only color;
 * verdicts stay at the metadata tier. Covers keep their native aspect.
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

/** "Película · 2023" / "Álbum · Charli xcx" / with mark or countdown. joinMeta
 *  owns the separator, so a missing tail never leaves a "·" dangling. */
function metaOf(event: FeedEvent) {
  const tail =
    event.waiting ??
    (event.mark
      ? markLabel(event.mark)
      : event.mediaType === "album"
        ? event.byline
        : event.year);
  return joinMeta([event.mediaTypeLabel, tail]);
}

const META = "font-mono text-[8px] uppercase tracking-[0.1em] text-text-3";

const backlogHref = (username: string, backlogId: string) => `/u/${username}/${backlogId}`;

// ---------- burst ----------

/** Covers in the strip before it folds into a "+N" tile. */
const STRIP_MAX = 12;

/** "Película ×5 · Álbum ×2" — per media type, in run order of first sight. */
function tally(items: FeedEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of items) counts.set(e.mediaTypeLabel, (counts.get(e.mediaTypeLabel) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${k} ×${n}`).join(" · ");
}

function BurstCard({ burst }: { burst: FeedBurst }) {
  const [expanded, setExpanded] = useState(false);
  const count = burst.items.length;
  const strip = burst.items.slice(0, STRIP_MAX);
  const folded = count - strip.length;
  return (
    <article className="flex flex-col gap-[10px] rounded-[18px] bg-surface-1 px-3.5 py-3">
      <Header author={burst.author} when={burst.when} />
      <div className="text-[12.5px] leading-[1.3] text-text-2">
        Agregó <b className="font-semibold text-text">{count} títulos</b> a{" "}
        <Link
          href={backlogHref(burst.author.username, burst.backlogId)}
          className="font-semibold text-text"
        >
          {burst.backlogName}
        </Link>
      </div>
      <div className="-mx-3.5 flex items-end gap-1.5 overflow-x-auto px-3.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strip.map((e) => (
          <Link key={e.id} href={`/item/${e.catalogItemId}`} aria-label={e.title} className="flex-none">
            <CoverThumb mediaType={e.mediaType} posterUrl={e.posterUrl} size="lg" />
          </Link>
        ))}
        {folded > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`Ver los ${count}`}
            className="flex h-16 w-16 flex-none items-center justify-center rounded-[10px] bg-surface-2 font-mono text-[11px] text-text-2"
          >
            +{folded}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span className={META}>{tally(burst.items)}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto py-1.5 pl-2.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-2 transition-colors hover:text-text"
        >
          {expanded ? "Ocultar" : `Ver los ${count}`}
        </button>
      </div>
      {expanded && (
        <div className="bl-rise flex flex-col gap-1.5 rounded-[12px] bg-surface-2 px-2.5 py-2">
          {burst.items.map((e) => (
            <Link key={e.id} href={`/item/${e.catalogItemId}`} className="flex items-center gap-2.5 py-[3px]">
              <CoverThumb mediaType={e.mediaType} posterUrl={e.posterUrl} size="xs" />
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
        <CoverThumb mediaType={event.mediaType} posterUrl={event.posterUrl} size="lg" />
        <span className="flex min-w-0 flex-col gap-1.5 pt-0.5">
          <span className="flex items-center gap-1.5 text-[13px] leading-[1.3] text-hot">
            <svg width="13" height="13" viewBox={GLYPH_VIEWBOX} fill="var(--hot)" aria-hidden className="flex-none">
              <path d={FLAME_PATH} />
            </svg>
            Le obsesiona
          </span>
          <span className="font-serif text-[27px] italic leading-[1.08] text-pretty text-text">{event.title}</span>
          <span className={META}>{metaOf(event)}</span>
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
        <CoverThumb mediaType={event.mediaType} posterUrl={event.posterUrl} size="md" />
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

/**
 * One row, two destinations, no nested anchors: the ITEM link is stretched
 * over the whole card (`after:inset-0` against the article's `relative`), so
 * the row stays a single tap target; the @handle and the backlog name sit
 * above it (`relative z-10`) with their own hrefs.
 */
function CompactCard({ event }: { event: FeedEvent }) {
  const verb =
    event.kind === "completed" ? "completó" : event.waiting ? "no puede esperar" : "agregó a";
  const shelf =
    event.kind === "added" && !event.waiting && event.backlogId && event.backlogName
      ? { id: event.backlogId, name: event.backlogName }
      : null;
  return (
    <article className="relative flex items-center gap-2.5 rounded-[14px] bg-surface-1 px-3 py-2.5">
      <AdnAvatar hexes={event.author.avatarHexes} className="mt-px h-[18px] w-[18px] self-start" />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-baseline gap-[5px] text-[12.5px] leading-[1.3] text-text-2">
          <Link
            href={`/u/${event.author.username}`}
            className="relative z-10 flex-none font-semibold text-text"
          >
            @{event.author.username}
          </Link>
          <span className="truncate">
            {verb}
            {shelf && (
              <>
                {" "}
                <Link
                  href={backlogHref(event.author.username, shelf.id)}
                  className="relative z-10 font-semibold text-text"
                >
                  {shelf.name}
                </Link>
              </>
            )}
          </span>
          <span className="ml-auto flex-none font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
            {event.when}
          </span>
        </span>
        <Link
          href={`/item/${event.catalogItemId}`}
          className="font-serif text-[17.5px] italic leading-[1.12] text-pretty text-text after:absolute after:inset-0 after:content-['']"
        >
          {event.title}
        </Link>
        <span className={`flex items-center gap-1.5 ${META}`}>
          {event.kind === "completed" && <MarkGlyph mark={event.mark} />}
          {metaOf(event)}
        </span>
      </span>
      <CoverThumb mediaType={event.mediaType} posterUrl={event.posterUrl} size="sm" />
    </article>
  );
}
