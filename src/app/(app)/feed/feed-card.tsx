"use client";

import Link from "next/link";
import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { MarkGlyph } from "@/components/reviews/review-card";
import { rgba } from "@/lib/color";
import { joinMeta } from "@/lib/format";
import { dominantHexes } from "@/modules/backlog/palette";
import type { MediaType } from "@/modules/catalog/types";
import { markLabel } from "@/modules/reviews/format";
import type { FeedBurst, FeedCard, FeedEvent } from "@/modules/social/types";
import { FeedGlow } from "./feed-glow";

/**
 * Feed v3 (design "Feed v3" → "Feed v3 componentes", 2026-09-02) — the cards
 * lose their surfaces. No fill, no radius: each card is its content over a
 * palette glow (feed-glow.tsx), separated from the next by 36px of dark. The
 * cover carries the card, at three sizes:
 *
 *  - HERO    — obsessed and reviewed: the cover FULL-BLEED at its native
 *              aspect, the author in a glass pill on top, the words in a
 *              glass panel at the bottom (serif 34 / 30). The rare events get
 *              the whole width.
 *  - BURST   — N consecutive adds by one author to one backlog: header with
 *              the sentence under the handle, a snap strip of 208px covers
 *              with the title printed on each, the per-type tally and a glass
 *              "Ver los N" that expands the rows in place (capped strip +
 *              "+N" tile, feed v2 review).
 *  - COMPACT — a lone add, a "no puede esperar", a completion: 124px cover
 *              on the LEFT, handle + verb, serif 24 title, meta · when.
 *
 * Every card is its own stacking context (`isolate`): the z-indexes that
 * order its layers (stretched link, pill, panel, raised handle links) must
 * never reach the page, where the sticky glass header sits at z-5 — without
 * it a hero pill scrolled under the header painted OVER it (founder report,
 * 2026-09-03).
 *
 * Links, never nested: the hero is one stretched item link under a raised
 * profile pill and a pointer-transparent text panel (only the spoiler button
 * takes taps); the compact keeps v2's stretched title link under raised
 * @handle / backlog links. The flame stays the only color; verdicts stay at
 * the metadata tier; covers keep their native aspect (album 1:1, video 2:3).
 * Glass = the mock's (rgba(18,18,24,.38) + its per-piece blur/saturate),
 * borderless (§7 — the one thing the mock draws that we don't). Gutter 20,
 * the mock's, matched by the feed's glass header (ScreenHeader `glass`).
 */

export function FeedCardView({ card }: { card: FeedCard }) {
  if (card.kind === "burst") return <BurstCard burst={card} />;
  const e = card.event;
  if (e.kind === "obsessed") return <ObsessedCard event={e} />;
  if (e.kind === "reviewed") return <ReviewedCard event={e} />;
  return <CompactCard event={e} />;
}

// ---------- shared bits ----------

const META = "font-mono text-[8.5px] uppercase tracking-[0.1em]";
/** The mock's `--glass`, with the blur each piece asks for. */
const GLASS_BG = "bg-[rgba(18,18,24,.38)]";
const GLASS = `${GLASS_BG} backdrop-blur-[16px]`;
/** Dark neutral depth under a cover (§7-exempt: no color, no glow). */
const COVER_SHADOW =
  "shadow-[0_18px_40px_-12px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.18)]";

const aspectOf = (m: MediaType) => (m === "album" ? "aspect-square" : "aspect-[2/3]");

/** The glow's colors: the cover's two leading hexes (the mock's `hx` pair),
 *  else the author's ADN — a card is never lit by nothing. */
const glowHexes = (e: FeedEvent) =>
  e.paletteHex.length > 0 ? e.paletteHex.slice(0, 2) : e.author.avatarHexes;

/** Where a cover has no art: the mock's "printed" gradient from the palette
 *  (a soft highlight over a diagonal), surface-2 when there is no palette. */
function posterFill(hexes: readonly string[]): string | undefined {
  const [a, b = a] = hexes;
  if (!a) return undefined;
  return `radial-gradient(90% 70% at 30% 20%, ${rgba(a, 0.55)} 0%, ${rgba(a, 0)} 70%), linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

/** A cover box at whatever size the caller gives it — the image fills it,
 *  the palette (then surface-2) stands in when there is none. */
function Cover({
  event,
  className,
  children,
}: {
  event: FeedEvent;
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`relative block overflow-hidden bg-surface-2 ${aspectOf(event.mediaType)} ${className}`}
      style={{ background: posterFill(event.paletteHex) }}
    >
      {event.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
        <img
          src={event.posterUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {children}
    </span>
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

const profileHref = (username: string) => `/u/${username}`;
const itemHref = (catalogItemId: string) => `/item/${catalogItemId}`;
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
  const { author } = burst;
  const count = burst.items.length;
  const strip = burst.items.slice(0, STRIP_MAX);
  const folded = count - strip.length;
  // The run's dominant colors (palette.ts owns the dedupe), the ADN if none.
  const mixed = dominantHexes(burst.items, 4);
  const hexes = mixed.length > 0 ? mixed : author.avatarHexes;

  return (
    <article className="relative isolate flex flex-col gap-3.5">
      <FeedGlow hexes={hexes} angle={110} className="inset-x-0 bottom-0 top-5" />
      <div className="relative flex items-center gap-[9px] px-5">
        <Link href={profileHref(author.username)} className="flex-none">
          <AdnAvatar
            hexes={author.avatarHexes}
            initial={author.initial}
            src={author.avatarUrl}
            className="h-[26px] w-[26px] text-[9px]"
          />
        </Link>
        <span className="flex min-w-0 flex-col gap-px">
          <Link
            href={profileHref(author.username)}
            className="truncate text-[13.5px] font-semibold text-text"
          >
            @{author.username}
          </Link>
          <span className="truncate text-[12.5px] leading-[1.3] text-text-2">
            agregó {count} títulos a{" "}
            <Link
              href={backlogHref(author.username, burst.backlogId)}
              className="font-semibold text-text"
            >
              {burst.backlogName}
            </Link>
          </span>
        </span>
        <span className={`ml-auto flex-none ${META} text-[9px] text-text-3`}>{burst.when}</span>
      </div>

      <div className="relative flex snap-x snap-proximity items-end gap-2.5 overflow-x-auto px-5 pb-1.5 pt-1 [scroll-padding-inline:20px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strip.map((e) => (
          <Link
            key={e.id}
            href={itemHref(e.catalogItemId)}
            aria-label={e.title}
            className="flex-none snap-start"
          >
            <Cover event={e} className={`h-[208px] rounded-[14px] ${COVER_SHADOW}`}>
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-black/0 px-2.5 pb-[9px] pt-[22px] font-serif text-sm italic leading-[1.1] text-text">
                {e.title}
              </span>
            </Cover>
          </Link>
        ))}
        {folded > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`Ver los ${count}`}
            className={`flex h-[208px] flex-none snap-start items-center justify-center rounded-[14px] font-mono text-[13px] text-text-2 aspect-[2/3] ${GLASS}`}
          >
            +{folded}
          </button>
        )}
      </div>

      <div className="relative flex items-center gap-2.5 px-5">
        <span className={`${META} text-text-3`}>{tally(burst.items)}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`ml-auto rounded-full px-3 py-[7px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-text ${GLASS}`}
        >
          {expanded ? "Ocultar" : `Ver los ${count}`}
        </button>
      </div>

      {expanded && (
        <div className={`bl-rise-soft relative mx-5 flex flex-col gap-2.5 rounded-[18px] px-3.5 py-3 backdrop-blur-[24px] backdrop-saturate-[1.4] ${GLASS_BG}`}>
          {burst.items.map((e) => (
            <Link key={e.id} href={itemHref(e.catalogItemId)} className="flex items-center gap-3">
              <Cover event={e} className="w-10 flex-none rounded-[7px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-serif text-[17px] italic leading-[1.12] text-text">
                  {e.title}
                </span>
                <span className={`${META} text-[8px] text-text-3`}>{metaOf(e)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

// ---------- heroes ----------

/**
 * The full-bleed cover with the three layers every hero shares: the
 * stretched item link (z-1) over the art, the profile pill (z-20) and the
 * pointer-transparent word panel (z-10) — so the whole cover is one tap to
 * the item, the pill is a tap to the profile, and nothing nests.
 */
function Hero({
  event,
  glowOpacity,
  /** The mock's sheen over the art: obsessed lights the top-RIGHT at .18,
   *  reviewed the top-LEFT at .16. */
  highlight,
  /** Gap of the word panel: 6 for obsessed, 5 for reviewed (the mock's). */
  panelGap,
  children,
}: {
  event: FeedEvent;
  glowOpacity: number;
  highlight: { x: string; alpha: number };
  panelGap: string;
  children: React.ReactNode;
}) {
  const { author } = event;
  return (
    <article className="relative isolate">
      <FeedGlow hexes={glowHexes(event)} opacity={glowOpacity} />
      <Cover event={event} className={`w-full shadow-[0_30px_60px_-20px_rgba(0,0,0,.8)]`}>
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 80% at ${highlight.x} 0%, rgba(255,255,255,${highlight.alpha}), rgba(255,255,255,0) 60%)`,
          }}
        />
        {/* The bottom of the art melts into the page bg over its last 160px
            (under the word panel, so the words keep their glass): a bleed
            hero otherwise ends in a hard horizontal cut against the dark,
            and the glow behind it can't hide an edge (founder, 2026-09-03). */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40"
          style={{ background: "linear-gradient(to bottom, rgba(11,11,13,0), var(--bg))" }}
        />
        {/* The art fades into the page bg over its last 224px (founder call
            2026-09-03: the mock's hard bottom edge read as a cut, and a 160px
            linear ramp still did — this one eases in and reaches bg sooner).
            Under the word panel, whose translucent gradient lets it through.
            Same color at alpha 0, never `transparent` (dark-fringe rule). */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-bg/0 via-bg/70 via-55% to-bg"
        />
        <Link
          href={itemHref(event.catalogItemId)}
          aria-label={event.title}
          className="absolute inset-0 z-[1]"
        />
        <Link
          href={profileHref(author.username)}
          className={`absolute left-3.5 top-3.5 z-20 flex max-w-[calc(100%-28px)] items-center gap-2 rounded-full py-[5px] pl-[5px] pr-3 backdrop-blur-[20px] backdrop-saturate-[1.5] ${GLASS_BG}`}
        >
          <AdnAvatar
            hexes={author.avatarHexes}
            initial={author.initial}
            src={author.avatarUrl}
            className="h-[22px] w-[22px] text-[8.5px]"
          />
          <span className="truncate text-[13px] font-semibold text-text">@{author.username}</span>
          <span className={`flex-none ${META} text-text-2`}>{event.when}</span>
        </Link>
        <span
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col px-5 pb-[22px] pt-[18px] backdrop-blur-[28px] backdrop-saturate-[1.6] ${panelGap}`}
          style={{
            background: "linear-gradient(rgba(18,18,24,.18), rgba(18,18,24,.5))",
            maskImage: "linear-gradient(transparent, #000 14px)",
            WebkitMaskImage: "linear-gradient(transparent, #000 14px)",
          }}
        >
          {children}
        </span>
      </Cover>
    </article>
  );
}

function ObsessedCard({ event }: { event: FeedEvent }) {
  return (
    <Hero event={event} glowOpacity={0.55} highlight={{ x: "80%", alpha: 0.18 }} panelGap="gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] leading-[1.3] text-hot">
        <svg width="13" height="13" viewBox={GLYPH_VIEWBOX} fill="var(--hot)" aria-hidden className="flex-none">
          <path d={FLAME_PATH} />
        </svg>
        Le obsesiona
      </span>
      <span className="font-serif text-[34px] italic leading-[1.02] tracking-[-0.01em] text-pretty text-text">
        {event.title}
      </span>
      <span className={`${META} text-text-2`}>{metaOf(event)}</span>
    </Hero>
  );
}

function ReviewedCard({ event }: { event: FeedEvent }) {
  return (
    <Hero event={event} glowOpacity={0.5} highlight={{ x: "20%", alpha: 0.16 }} panelGap="gap-[5px]">
      <span className="text-[13px] leading-[1.3] text-text-2">Reseñó</span>
      <span className="font-serif text-[30px] italic leading-[1.04] text-pretty text-text">
        {event.title}
      </span>
      <span className={`flex items-center gap-1.5 ${META} text-text-2`}>
        <MarkGlyph mark={event.mark} />
        {metaOf(event)}
      </span>
      {event.reviewBody !== null && (
        <HeroReviewBody body={event.reviewBody} hasSpoiler={event.hasSpoiler} />
      )}
    </Hero>
  );
}

/**
 * The review's words inside the hero panel, with the mock's spoiler
 * treatment (not the reviews block's SpoilerBody, whose plain label was made
 * for a surface card): the text stays in place at blur 6px / opacity .4 and
 * a glass pill sits over it at 55% of its height — revealing brings it into
 * focus without moving the panel. The hairline above is a content divider
 * (§7-exempt); the pill is borderless like every glass in the app. The only
 * thing in the pointer-transparent panel that takes a tap is this button.
 */
function HeroReviewBody({ body, hasSpoiler }: { body: string; hasSpoiler: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const words = "text-[14.5px] leading-[1.45] text-pretty text-text";
  if (!hasSpoiler || revealed) {
    return (
      <p className={`mt-2 border-t border-white/[0.12] pt-3 ${words}`}>{body}</p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="pointer-events-auto relative mt-2 block w-full border-t border-white/[0.12] pt-3 text-left"
    >
      <span className={`block select-none opacity-40 blur-[6px] ${words}`}>{body}</span>
      <span className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[rgba(20,20,26,.6)] px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-text backdrop-blur-[16px]">
        Contiene spoiler · Mostrar
      </span>
    </button>
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
    <article className="relative isolate flex items-center gap-[18px] px-5">
      <FeedGlow hexes={glowHexes(event)} opacity={0.4} className="-inset-y-2.5 left-0 w-3/5" />
      <Cover event={event} className={`w-[124px] flex-none rounded-[14px] ${COVER_SHADOW}`} />
      <span className="relative flex min-w-0 flex-1 flex-col gap-[7px]">
        <span className="flex min-w-0 items-center gap-[7px]">
          <AdnAvatar
            hexes={event.author.avatarHexes}
            src={event.author.avatarUrl}
            className="h-[18px] w-[18px]"
          />
          <span className="truncate text-[12.5px] leading-[1.3] text-text-2">
            <Link
              href={profileHref(event.author.username)}
              className="relative z-10 font-semibold text-text"
            >
              @{event.author.username}
            </Link>{" "}
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
        </span>
        <Link
          href={itemHref(event.catalogItemId)}
          className="font-serif text-2xl italic leading-[1.08] text-pretty text-text after:absolute after:inset-0 after:content-['']"
        >
          {event.title}
        </Link>
        <span className={`flex items-center gap-1.5 ${META} text-text-3`}>
          {event.kind === "completed" && <MarkGlyph mark={event.mark} />}
          {metaOf(event)} · {event.when}
        </span>
      </span>
    </article>
  );
}
