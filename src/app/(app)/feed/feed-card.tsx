"use client";

import Link from "next/link";
import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { FLAME_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { MarkGlyph } from "@/components/reviews/review-card";
import { mixToward, rgba, type RGB } from "@/lib/color";
import { joinMeta } from "@/lib/format";
import { dominantHexes } from "@/modules/backlog/palette";
import type { MediaType } from "@/modules/catalog/types";
import { markLabel } from "@/modules/reviews/format";
import type { FeedBurst, FeedCard, FeedEvent } from "@/modules/social/types";
import { PaletteGlow } from "@/components/ui/palette-glow";

/**
 * Feed v3 (design "Feed v3" → "Feed v3 componentes", 2026-09-02) — the cards
 * lose their surfaces. No fill, no radius: each card is its content over a
 * palette glow, separated from the next by the frame's RHYTHM (feed-list.tsx
 * owns it: 72px between two heroes, 56 before one, 28 after one, 36
 * otherwise — never a single flat gap). A hero also bleeds its tone into the
 * cards around it (`spill`/`rise`) and masks its art and word band by what
 * follows it; see CardCtx. The cover carries the card, at three sizes:
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
 * the metadata tier; covers keep their native aspect (album 1:1, video 3:4).
 * Every author arrives on the same glass pill (AuthorPill), never loose
 * beside an avatar. Glass = the mock's (rgba(18,18,24,.38) + per-piece
 * blur/saturate),
 * borderless (§7 — the one thing the mock draws that we don't). Gutter 20,
 * the mock's, matched by the feed's glass header (ScreenHeader `glass`).
 */

export function FeedCardView({ card, ctx = NO_CTX }: { card: FeedCard; ctx?: CardCtx }) {
  if (card.kind === "burst") return <BurstCard burst={card} />;
  const e = card.event;
  if (e.kind === "obsessed") return <ObsessedCard event={e} ctx={ctx} />;
  if (e.kind === "reviewed") return <ReviewedCard event={e} ctx={ctx} />;
  return <CompactCard event={e} />;
}

// ---------- shared bits ----------

const META = "font-mono text-[8.5px] uppercase tracking-[0.1em]";
/** The mock's `--glass`, with the blur each piece asks for. */
const GLASS_BG = "bg-[rgba(18,18,24,.38)]";
const GLASS = `${GLASS_BG} backdrop-blur-[16px]`;
/** Dark neutral depth under a cover (§7-exempt: no color, no glow). The
 *  frame gives each size its own recipe — they are not interchangeable. */
const BURST_SHADOW =
  "shadow-[0_18px_40px_-12px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.18)]";
const COMPACT_SHADOW =
  "shadow-[0_20px_40px_-14px_rgba(0,0,0,.75),inset_0_1px_0_rgba(255,255,255,.18)]";

/** Press response for a card whose tap target is a STRETCHED link: the
 *  visible card sinks while `[data-stretch]` is held (the `bl-press-lg` depth
 *  and timing), and the nested links/buttons keep their own press state. */
const STRETCH_PRESS =
  "transition-[scale,opacity] duration-200 ease-[var(--ease-out)] has-[[data-stretch]:active]:scale-[0.985] has-[[data-stretch]:active]:duration-[80ms] motion-reduce:has-[[data-stretch]:active]:scale-100 motion-reduce:has-[[data-stretch]:active]:opacity-80";

const aspectOf = (m: MediaType) => (m === "album" ? "aspect-square" : "aspect-[3/4]");

/**
 * The author, in the frame's glass pill: orb + @handle + a trailing mono
 * label (the "when", or "Sugerencia" on the suggestion). Every card in Feed
 * v3 introduces its author this way — burst, compact, hero and suggestion —
 * so the handle always arrives on the same chip instead of loose next to an
 * avatar. `sm` is the compact card's tighter build (the frame's `4px 10px
 * 4px 4px` / orb 20 / 12.5px against the standard `5px 12px 5px 5px` /
 * orb 22 / 13px).
 */
export function AuthorPill({
  username,
  initial,
  avatarUrl,
  avatarHexes,
  trailing,
  sm = false,
  className = "",
}: {
  username: string;
  initial?: string;
  avatarUrl: string | null;
  avatarHexes: readonly [string, string];
  trailing?: string;
  sm?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={profileHref(username)}
      className={`flex max-w-full items-center rounded-full backdrop-blur-[20px] backdrop-saturate-[1.5] bl-press ${GLASS_BG} ${
        sm ? "gap-[7px] py-1 pl-1 pr-2.5" : "gap-2 py-[5px] pl-[5px] pr-3"
      } ${className}`}
    >
      <AdnAvatar
        hexes={avatarHexes}
        initial={initial}
        src={avatarUrl}
        className={sm ? "h-5 w-5 text-[8px]" : "h-[22px] w-[22px] text-[8.5px]"}
      />
      <span
        className={`truncate font-semibold text-text ${sm ? "text-[12.5px]" : "text-[13px]"}`}
      >
        @{username}
      </span>
      {trailing && (
        <span
          className={`flex-none font-mono uppercase tracking-[0.1em] text-text-2 ${
            sm ? "text-[8px]" : "text-[8.5px]"
          }`}
        >
          {trailing}
        </span>
      )}
    </Link>
  );
}

/**
 * Where a card sits in the run. The frame derives real geometry from this:
 * a hero bleeds its tone DOWN into the card below (`spill`), rises out of a
 * non-hero above it (`rise`), and masks its art and word band differently
 * depending on whether the NEXT card is another hero. Without it every hero
 * is a hard rectangle and the feed loses the colour that joins the cards.
 */
export type CardCtx = {
  /** `null` when nothing follows this card on screen. */
  nextIsGem: boolean | null;
  followsHero: boolean;
  followsOther: boolean;
};

export const NO_CTX: CardCtx = {
  nextIsGem: null,
  followsHero: false,
  followsOther: false,
};

/** "gem" in the frame: the two rare events that get the whole width. */
export const isGemCard = (c: FeedCard) =>
  c.kind !== "burst" && (c.event.kind === "obsessed" || c.event.kind === "reviewed");

/** The frame's `mixDark(h, .5)`: the tone, halfway to the page dark. */
const DARK: RGB = { r: 18, g: 18, b: 18 };
const toneEdgeOf = (hexes: readonly string[]) =>
  mixToward(hexes[1] ?? hexes[0] ?? "#0b0b0d", DARK, 0.5);

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
  artMask,
  overlay,
  children,
}: {
  event: FeedEvent;
  className: string;
  /** The frame's `artMask` — fades the ART only, never the pill or band. */
  artMask?: string;
  /** Painted inside the masked art layer (the hero's sheen). */
  overlay?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const mask = artMask ? { maskImage: artMask, WebkitMaskImage: artMask } : null;
  return (
    <span
      className={`relative block overflow-hidden ${aspectOf(event.mediaType)} ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-surface-2"
        style={{ background: posterFill(event.paletteHex), ...mask }}
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
        {overlay}
      </span>
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
      <PaletteGlow hexes={hexes} angle={110} className="inset-x-0 bottom-0 top-5" />
      <div className="relative flex flex-col items-start gap-2.5 px-5">
        <AuthorPill
          username={author.username}
          initial={author.initial}
          avatarUrl={author.avatarUrl}
          avatarHexes={author.avatarHexes}
          trailing={burst.when}
        />
        <span className="text-[13px] leading-[1.3] text-text-2">
          Agregó {count} títulos a{" "}
          <Link
            href={backlogHref(author.username, burst.backlogId)}
            className="font-semibold text-text transition-opacity active:opacity-60"
          >
            {burst.backlogName}
          </Link>
        </span>
      </div>

      <div className="relative flex snap-x snap-proximity items-end -mb-[38px] -mt-5 gap-2.5 overflow-x-auto px-5 pb-11 pt-6 [scroll-padding-inline:20px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {strip.map((e) => (
          <Link
            key={e.id}
            href={itemHref(e.catalogItemId)}
            aria-label={e.title}
            className="flex-none snap-start bl-press-lg"
          >
            <Cover event={e} className={`h-[208px] rounded-[14px] ${BURST_SHADOW}`}>
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
            className={`flex h-[208px] flex-none snap-start items-center justify-center rounded-[14px] font-mono text-[13px] text-text-2 aspect-[3/4] bl-press-lg ${GLASS}`}
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
          className={`ml-auto rounded-full px-3 py-[7px] font-mono text-[9.5px] uppercase tracking-[0.12em] text-text bl-press ${GLASS}`}
        >
          {expanded ? "Ocultar" : `Ver los ${count}`}
        </button>
      </div>

      {expanded && (
        <div className={`bl-rise-soft relative mx-5 flex flex-col gap-2.5 rounded-[18px] px-3.5 py-3 backdrop-blur-[24px] backdrop-saturate-[1.4] ${GLASS_BG}`}>
          {burst.items.map((e) => (
            <Link
              key={e.id}
              href={itemHref(e.catalogItemId)}
              className="flex items-center gap-3 transition-opacity active:opacity-70"
            >
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
  ctx,
  children,
}: {
  event: FeedEvent;
  glowOpacity: number;
  highlight: { x: string; alpha: number };
  panelGap: string;
  ctx: CardCtx;
  children: React.ReactNode;
}) {
  const { author } = event;

  // The frame's geometry for this position in the run.
  const hasNext = ctx.nextIsGem !== null;
  const pair = ctx.nextIsGem === true;
  const spill = hasNext ? (pair ? 72 : 120) : 0;
  const rise = ctx.followsOther ? 140 : 0;
  const hx = glowHexes(event);
  const toneTop = hx[0] ?? "#0b0b0d";
  const toneEdge = toneEdgeOf(hx);

  // The frame's mask stops are PIXELS, tuned on a 3/4 hero. A square album
  // cover is a quarter shorter, so the same 120px fade-in plus 140px tail ate
  // most of its art and a light palette read as a washed band. Scale the
  // stops by the aspect so every hero loses the same PROPORTION of its art
  // instead of the same number of pixels.
  const px = (n: number) => `${Math.round(n * (event.mediaType === "album" ? 0.75 : 1))}px`;

  const bandMask = !hasNext
    ? `linear-gradient(transparent, #000 ${px(96)})`
    : pair
      ? `linear-gradient(transparent, #000 ${px(96)}, #000 calc(100% - ${px(160)}), transparent 100%)`
      : `linear-gradient(transparent, #000 ${px(96)}, #000 calc(100% - ${px(120)}), rgba(0,0,0,.5) calc(100% - ${px(60)}), transparent 100%)`;

  const artMask =
    (ctx.followsHero
      ? `linear-gradient(180deg, transparent 0px, #000 ${px(200)}`
      : ctx.followsOther
        ? `linear-gradient(180deg, transparent 0px, #000 ${px(120)}`
        : "linear-gradient(180deg, #000 0px, #000 0px") +
    (!hasNext
      ? ", #000 100%)"
      : pair
        ? `, #000 calc(100% - ${px(160)}), transparent 100%)`
        : `, #000 calc(100% - ${px(140)}), rgba(0,0,0,.6) calc(100% - ${px(70)}), rgba(0,0,0,.2) calc(100% - ${px(25)}), transparent 100%)`);

  return (
    <article className="relative isolate">
      {/* The tone rising out of the ordinary card above (the frame's
          `riseBg`), so a hero does not start on a hard edge. */}
      {rise > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{
            top: `-${rise}px`,
            height: `${rise + 120}px`,
            background: `linear-gradient(0deg, ${toneTop} 0px, ${toneTop} 120px, ${rgba(toneTop, 0.8)} 150px, ${rgba(toneTop, 0.5)} 185px, ${rgba(toneTop, 0.22)} 220px, ${rgba(toneTop, 0.06)} 250px, transparent 100%)`,
          }}
        />
      )}
      {/* …and the tone spilling DOWN onto whatever follows (`spillBg`).
          Two adjacent heroes skip it: they share an edge instead. */}
      {spill > 0 && !pair && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{
            bottom: `-${spill}px`,
            height: `${spill + 60}px`,
            background: `linear-gradient(180deg, ${rgba(toneEdge, 0.35)} 0px, ${rgba(toneEdge, 0.55)} 40px, ${rgba(toneEdge, 0.55)} 80px, ${rgba(toneEdge, 0.28)} 120px, ${rgba(toneEdge, 0.1)} 160px, transparent 100%)`,
          }}
        />
      )}
      <PaletteGlow
        hexes={glowHexes(event)}
        opacity={glowOpacity}
        blur={80}
        className="-inset-x-[10px] -top-[30px] bottom-10"
      />
      <Cover
        event={event}
        className={`w-full ${STRETCH_PRESS}`}
        artMask={artMask}
        overlay={
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 80% at ${highlight.x} 0%, rgba(255,255,255,${highlight.alpha}), rgba(255,255,255,0) 60%)`,
            }}
          />
        }
      >
        <Link
          href={itemHref(event.catalogItemId)}
          aria-label={event.title}
          data-stretch
          className="absolute inset-0 z-[1]"
        />
        <Link
          href={profileHref(author.username)}
          className={`absolute left-5 top-5 z-20 flex max-w-[calc(100%-40px)] items-center gap-2 rounded-full py-[5px] pl-[5px] pr-3 backdrop-blur-[20px] backdrop-saturate-[1.5] bl-press ${GLASS_BG}`}
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
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col px-5 pb-[22px] pt-[72px] backdrop-blur-[28px] ${panelGap}`}
          style={{
            background:
              "linear-gradient(rgba(18,18,24,0), rgba(18,18,24,.22) 35%, rgba(18,18,24,.5) 80%, rgba(18,18,24,.5))",
            maskImage: bandMask,
            WebkitMaskImage: bandMask,
          }}
        >
          {children}
        </span>
      </Cover>
    </article>
  );
}

function ObsessedCard({ event, ctx }: { event: FeedEvent; ctx: CardCtx }) {
  return (
    <Hero
      event={event}
      glowOpacity={0.55}
      highlight={{ x: "80%", alpha: 0.18 }}
      panelGap="gap-1.5"
      ctx={ctx}
    >
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

function ReviewedCard({ event, ctx }: { event: FeedEvent; ctx: CardCtx }) {
  return (
    <Hero
      event={event}
      glowOpacity={0.5}
      highlight={{ x: "20%", alpha: 0.16 }}
      panelGap="gap-[5px]"
      ctx={ctx}
    >
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
      className="pointer-events-auto relative mt-2 block w-full border-t border-white/[0.12] pt-3 text-left transition-opacity active:opacity-70"
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
  // The frame capitalizes the verb: it opens its own line under the pill,
  // it is not a continuation of "@handle …".
  const verb =
    event.kind === "completed" ? "Completó" : event.waiting ? "No puede esperar" : "Agregó a";
  const shelf =
    event.kind === "added" && !event.waiting && event.backlogId && event.backlogName
      ? { id: event.backlogId, name: event.backlogName }
      : null;
  return (
    <article className={`relative isolate flex flex-col gap-2.5 px-5 ${STRETCH_PRESS}`}>
      <PaletteGlow
        hexes={glowHexes(event)}
        opacity={0.4}
        blur={60}
        className="-inset-y-2.5 left-0 w-3/5"
      />
      <AuthorPill
        sm
        username={event.author.username}
        initial={event.author.initial}
        avatarUrl={event.author.avatarUrl}
        avatarHexes={event.author.avatarHexes}
        trailing={event.when}
        className="relative z-10 self-start"
      />
      <div className="relative flex items-center gap-[18px]">
        <Cover event={event} className={`w-[124px] flex-none rounded-[14px] ${COMPACT_SHADOW}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-[7px]">
          <span className="truncate text-[13px] leading-[1.3] text-text-2">
            {verb}
            {shelf && (
              <>
                {" "}
                <Link
                  href={backlogHref(event.author.username, shelf.id)}
                  className="relative z-10 font-semibold text-text transition-opacity active:opacity-60"
                >
                  {shelf.name}
                </Link>
              </>
            )}
          </span>
          <Link
            href={itemHref(event.catalogItemId)}
            data-stretch
            className="font-serif text-2xl italic leading-[1.08] text-pretty text-text after:absolute after:inset-0 after:content-['']"
          >
            {event.title}
          </Link>
          <span className={`flex items-center gap-1.5 ${META} text-text-3`}>
            {event.kind === "completed" && <MarkGlyph mark={event.mark} />}
            {metaOf(event)}
          </span>
        </span>
      </div>
    </article>
  );
}
