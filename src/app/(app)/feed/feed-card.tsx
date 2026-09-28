"use client";

import Link from "next/link";
import { useState } from "react";
import { sealHexesOf } from "@/components/adn-avatar";
import { FollowButton } from "@/components/follow-button";
import { Seal } from "@/components/kura/components";
import {
  BOOKMARK_PATH,
  CHECK_FILL_PATH,
  CLOCK_PATH,
  FLAME_PATH,
  GLYPH_VIEWBOX,
  LIKE_PATH,
  REVIEW_PATH,
  USERS_PATH,
} from "@/components/glyph-paths";
import { rgba } from "@/lib/color";
import { dominantHexes } from "@/modules/backlog/palette";
import type { MediaType } from "@/modules/catalog/types";
import type { FeedBurst, FeedCard, FeedEvent, FeedSuggestion } from "@/modules/social/types";
import {
  BAND_SHADOW_ALPHA,
  CARD_RADIUS,
  EXT_BOTTOM,
  STICKY_TOP,
  TIER,
  bandShadow,
  cardBackground,
  cardEnds,
  tierHeight,
  type TierName,
} from "./feed-geometry";


/**
 * Feed v8 Stack (design "Feed v8 Stack", 2026-09-21) — the feed stops being a
 * column of surfaceless cards and becomes a STACK: every event is its own
 * sticky, tinted card that pins under the header and is slid over by the next
 * one. Each card is a little screen of its own — author pill on top, the
 * artwork filling the middle at its natural aspect, and a text block at the
 * bottom where every state is a PILL with its glyph (one vocabulary: flame,
 * thumb, check, bookmark, clock, review, users).
 *
 * The geometry is the mock's, and it is load-bearing:
 *  - each card is `sticky` at HDR with a tier height, `margin-bottom` -EXTB
 *    against `padding-bottom` EXTB+22: the body runs on BELOW the card's own
 *    height, so the card rising from underneath always mounts over filled
 *    colour instead of over the page background.
 *  - the tier caps height against the viewport (`min(620px, 100dvh * .72)`)
 *    so the next card's top edge always shows — that edge is what says the
 *    stack continues.
 *  - the card colour is the title's own palette dragged most of the way to
 *    black (`cardEnds`), so the stack reads as the covers' light rather than
 *    as a set of surfaces.
 *  - the shadow is SHORT and faint (`0 -8px 18px rgba(0,0,0,.42)`). The long
 *    one it replaced stacked: every pinned card added its shadow to the one
 *    below and the pile darkened as you scrolled. Only the card coming in is
 *    actually visible, so a short one is all the separation that is needed.
 *  - no 1px edge light: in the mock that hairline became the `edgeLight`
 *    tweak and ships OFF. The card reads flatter but cleaner, and with the
 *    120px overlap the shadow alone carries the separation.
 *
 * Feed v10 · Kura (2026-09-24) changes only details on top of the v8 stack:
 * the author chip carries the SEAL (28) instead of the ADN orb, covers are
 * 2:3 (Kura's DS rules — the founder adopted it with Kura; the old 3:4
 * exception is gone), every pill is mono with its glyph in the state colour
 * (coral obsesiona · pizarra gusta · salvia completo · lavanda espera), the
 * suggestion's "Seguir" is honey WITHOUT the lima glow (that exception died
 * with the Revamp), and the feed's greys are the root's (no `.feed-v8`
 * override). The tint is `tintEnds` from `kura/tint.ts` — the same 45 % the
 * v8 mock drew, now shared with every tinted surface of the app.
 *
 * iOS parity (founder, 2026-09-27: "en la web todavía está la vieja versión
 * del feed") — the web follows `ios/Kura/Features/Feed/FeedView.swift`:
 *  - the FIRST card runs up behind the transparent header (no corners, its
 *    content starts under the header); cards 1… pin under it with 26 corners
 *    and raise a BAND of their own top colour over the header in the last
 *    140px before pinning (`data-feed-band`, driven by FeedList's scroll).
 *    The resting shadow lives on the band and fades as it rises.
 *  - tiers: a review or the suggestion is L, every cover card is M.
 *  - pills follow iOS: a completion with a reaction shows only the reaction;
 *    an add/burst pill ends in "en" and the collection's NAME follows it in
 *    Newsreader 17 (a link to the public collection); the title's tail is the
 *    creator, else the format — never the year.
 *  - the suggestion opens with the "Sugerencia para ti" pill, says its
 *    reason roman with the work in italic, then the seal 44 + @handle, the
 *    shared follows and the honey Seguir (44 · 20 · 15).
 *  - the burst strip snaps the first cover to the start, the last to the end
 *    and the rest to the centre (iOS `BurstSnap`); each caption is 46 high.
 */


/** Kura's forms: disco 1:1, póster 2:3. */
const aspectOf = (m: MediaType) => (m === "album" ? "1 / 1" : "2 / 3");

/** A burst cover's caption (iOS `BurstCaption.height`): 8 + Newsreader 16 + 3 + mono 10. */
const BURST_CAPTION = 46;

/** The cover's hexes, else the author's ADN (minus the lima fallback pair). */
const cardHexes = (e: FeedEvent): readonly string[] =>
  e.paletteHex.length > 0 ? e.paletteHex : sealHexesOf(e.author.avatarHexes);

/** Where a cover has no art: the palette as a printed gradient. */
function posterFill(hexes: readonly string[]): string | undefined {
  const [a, b = a] = hexes;
  if (!a) return undefined;
  return `radial-gradient(90% 70% at 30% 20%, ${rgba(a, 0.55)} 0%, ${rgba(a, 0)} 70%), linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

// ---------- the pill vocabulary ----------

type Pill = { label: string; d: string; color: string };

/** One glyph, one meaning; the colour is the state's (§glifos). */
const P = {
  flame: (label: string): Pill => ({ label, d: FLAME_PATH, color: "var(--st-obsessed)" }),
  up: (label: string): Pill => ({ label, d: LIKE_PATH, color: "var(--st-liked)" }),
  check: (label: string): Pill => ({ label, d: CHECK_FILL_PATH, color: "var(--st-completed)" }),
  bookmark: (label: string): Pill => ({ label, d: BOOKMARK_PATH, color: "var(--text)" }),
  clock: (label: string): Pill => ({ label, d: CLOCK_PATH, color: "var(--st-waiting)" }),
  review: (label: string): Pill => ({ label, d: REVIEW_PATH, color: "var(--text)" }),
  users: (label: string): Pill => ({ label, d: USERS_PATH, color: "var(--text)" }),
};

/**
 * The author's reaction as a pill. "No le gusta" doesn't exist in kura
 * (founder 2026-09-27): an old `disliked` verdict gets no pill.
 */
function reactionPill(mark: FeedEvent["mark"]): Pill | null {
  if (mark === "liked") return P.up("Le gusta");
  if (mark === "obsessed") return P.flame("Le obsesiona");
  return null;
}

/**
 * iOS `FeedCard.pills`: one vocabulary of states. A completed title with a
 * reaction shows only the reaction; a review adds its reaction; a waiting add
 * shows only the wait; an add ends in "en" and the collection's name follows
 * the pill (`CollectionName`).
 */
function pillsFor(e: FeedEvent): Pill[] {
  if (e.waiting) return [P.clock(`No puede esperar · ${e.waiting}`)];
  switch (e.kind) {
    case "obsessed":
      return [P.flame("Le obsesiona")];
    case "completed":
      return [reactionPill(e.mark) ?? P.check("Completo")];
    case "reviewed": {
      const r = reactionPill(e.mark);
      return r ? [P.review("Reseñó"), r] : [P.review("Reseñó")];
    }
    case "added":
      return [P.bookmark(e.backlogName ? "Guardó en" : "Guardó")];
  }
}

/** The design's Card pill (sistema-de-diseno · pillVariants: glifo 13 · mono 12 · 9/14, 30 high)
 *  — iOS `KPill.card`. */
function PillView({ p }: { p: Pill }) {
  return (
    <span className="inline-flex h-[30px] items-center gap-2 rounded-full bg-[var(--glass-bg)] px-[14px] font-mono text-[12px] uppercase leading-none tracking-[0.06em] text-text">
      <svg width="13" height="13" viewBox={GLYPH_VIEWBOX} fill={p.color} aria-hidden className="flex-none">
        <path d={p.d} />
      </svg>
      {p.label}
    </span>
  );
}

/** Pills, then (adds and bursts) the collection's name — wraps like iOS's FlowLayout (7/7). */
function PillRow({ pills, collection }: { pills: Pill[]; collection?: React.ReactNode }) {
  if (pills.length === 0 && !collection) return null;
  return (
    <div className="flex flex-wrap items-center gap-[7px]">
      {pills.map((p) => (
        <PillView key={p.label} p={p} />
      ))}
      {collection}
    </div>
  );
}

/**
 * "guardó … en" + the collection's own name: Newsreader roman, its identity
 * everywhere else (crítica #22), 30 high like the pill it follows. A link to
 * the public collection — the feed query already gates adds on
 * `backlogs.isPublic`, so a named add's collection has a live public URL.
 */
function CollectionName({
  name,
  username,
  backlogId,
}: {
  name: string;
  username: string;
  backlogId: string | null;
}) {
  const cls = "inline-flex h-[30px] max-w-full items-center truncate font-brand text-[17px] leading-none text-text";
  if (!backlogId) return <span className={cls}>{name}</span>;
  return (
    <Link
      href={`/u/${username}/${backlogId}`}
      aria-label={`Colección ${name}`}
      className={`${cls} rounded-[6px] transition-opacity active:opacity-60`}
    >
      {name}
    </Link>
  );
}

// ---------- shared chrome ----------

function AuthorPill({
  username,
  avatarUrl,
  avatarHexes,
  trailing,
}: {
  username: string;
  avatarUrl: string | null;
  avatarHexes: readonly string[];
  trailing: string;
}) {
  return (
    <Link
      href={`/u/${username}`}
      className="relative z-10 flex h-9 max-w-full flex-none items-center gap-2 self-start rounded-full bg-[var(--glass-bg)] py-1 pl-1 pr-3 bl-press"
    >
      <Seal name={username} hexes={sealHexesOf(avatarHexes)} src={avatarUrl} size={28} />
      <span className="truncate text-[13px] font-semibold text-text">@{username}</span>
      <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
        {trailing}
      </span>
    </Link>
  );
}

/**
 * The card shell: sticky, its own tint, and a body that runs EXT_BOTTOM past
 * its height so the next card never rises over bare page.
 *
 * The FIRST card (`first`) runs up behind the header — pinned at 0, pulled up
 * by the header's height, no corners, its content starting under the header —
 * exactly iOS's card 0. Every other card pins under the header with 26
 * corners and carries its BAND: its own top colour, rounded, sitting behind
 * the card; FeedList lifts it (`--rise`, `--p`) over the last 140px before
 * the card pins so the header area turns to the arriving card's colour, and
 * the resting shadow fades as it goes. The band is a sibling of the clipped
 * surface (the surface clips, the article doesn't) so it can rise above it.
 */
export function StackCard({
  hexes,
  size,
  first = false,
  children,
}: {
  hexes: readonly string[];
  size: TierName;
  first?: boolean;
  children: React.ReactNode;
}) {
  const h = tierHeight(size);
  const bg = cardBackground(hexes);
  return (
    <article
      data-feed-card
      className="sticky flex-none [scroll-snap-align:start]"
      style={{
        top: first ? 0 : STICKY_TOP,
        height: first ? `calc(${h} + ${STICKY_TOP} + ${EXT_BOTTOM}px)` : `calc(${h} + ${EXT_BOTTOM}px)`,
        marginTop: first ? `calc(-1 * ${STICKY_TOP})` : undefined,
        marginBottom: `-${EXT_BOTTOM}px`,
      }}
    >
      {!first && (
        <div
          aria-hidden
          data-feed-band
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: `calc(${STICKY_TOP} + ${CARD_RADIUS * 3}px)`,
            borderTopLeftRadius: CARD_RADIUS,
            borderTopRightRadius: CARD_RADIUS,
            background: cardEnds(hexes)[0],
            // The resting shadow fades as the band rises (`--p` 0 → 1).
            boxShadow: bandShadow(`calc(${BAND_SHADOW_ALPHA} * (1 - var(--p, 0)))`),
            transform: "translateY(calc(-1 * var(--rise, 0px)))",
          }}
        />
      )}
      <div
        className="absolute inset-0 flex flex-col gap-3.5 overflow-hidden px-5 [container-type:inline-size]"
        style={{
          background: bg,
          borderTopLeftRadius: first ? 0 : CARD_RADIUS,
          borderTopRightRadius: first ? 0 : CARD_RADIUS,
          paddingTop: first ? `calc(18px + ${STICKY_TOP})` : "18px",
          paddingBottom: `${22 + EXT_BOTTOM}px`,
        }}
      >
        {children}
      </div>
    </article>
  );
}

/** The middle band: the artwork, centred, taking whatever height is left. */
function Art({ children }: { children: React.ReactNode }) {
  return <div className="relative flex min-h-0 flex-1 items-center justify-center">{children}</div>;
}

/** Hugs its text up to the tier's cap (iOS `CappedHeight`); a suggestion never clips. */
function TextBlock({ size, capped = true, children }: { size: TierName; capped?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-none flex-col gap-[9px] overflow-hidden"
      style={capped ? { maxHeight: `${TIER[size].textMax}px` } : undefined}
    >
      {children}
    </div>
  );
}

function Title({ title, tail }: { title: string; tail: string | null }) {
  return (
    <span className="font-brand text-[26px] italic leading-[1.08] text-pretty text-text">
      {title}
      {tail && <span className="text-text-2">{` · ${tail}`}</span>}
    </span>
  );
}

/**
 * The hexes a card is tinted from — the list needs them to continue the page
 * in the LAST card's bottom colour (the mock's `tailBg`), so the stack does
 * not end on a hard edge against the page background.
 */
export function hexesOfCard(card: FeedCard): readonly string[] {
  if (card.kind !== "burst") return cardHexes(card.event);
  return burstHexes(card);
}

/** iOS `palette(.burst)`: the first cover's first hex, the last cover's second. */
function burstHexes({ items, author }: FeedBurst): readonly string[] {
  const first = items[0]?.paletteHex ?? [];
  const last = items[items.length - 1]?.paletteHex ?? [];
  if (first.length > 0) return [first[0], last[1] ?? last[0] ?? first[0]];
  const mixed = dominantHexes(items, 4);
  return mixed.length > 0 ? mixed : sealHexesOf(author.avatarHexes);
}

// ---------- cards ----------

export function FeedCardView({ card, first = false }: { card: FeedCard; first?: boolean }) {
  if (card.kind === "burst") return <BurstCard burst={card} first={first} />;
  return <EventCard event={card.event} first={first} />;
}

/** iOS `FeedEvent.tier`: a review (with or without words) is L; every cover card is M. */
function sizeOf(e: FeedEvent): TierName {
  return e.kind === "reviewed" ? "L" : "M";
}

const BODY =
  "text-[15px] leading-[1.5] text-pretty text-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden";

function EventCard({ event, first }: { event: FeedEvent; first: boolean }) {
  const size = sizeOf(event);
  // "título · creador" — the byline (artist, studio/network), else the format; never the year
  // (iOS `FeedCard.tail`, crítica #21: the same second datum the burst captions carry).
  const tail = event.byline ?? event.mediaTypeLabel;
  const named = event.kind === "added" && !event.waiting && event.backlogName;
  return (
    <StackCard hexes={cardHexes(event)} size={size} first={first}>
      <AuthorPill
        username={event.author.username}
        avatarUrl={event.author.avatarUrl}
        avatarHexes={event.author.avatarHexes}
        trailing={event.when}
      />
      <Art>
        <Link
          href={`/item/${event.catalogItemId}`}
          aria-label={event.title}
          className="block h-full max-w-full bl-press-lg"
          style={{ aspectRatio: aspectOf(event.mediaType) }}
        >
          <span
            role="img"
            aria-label={event.title}
            className="block h-full w-full rounded-[var(--r-cover-l)] bg-surface-2 bg-cover bg-center bg-no-repeat shadow-cover"
            style={{
              backgroundImage: event.posterUrl
                ? `url(${event.posterUrl})`
                : posterFill(event.paletteHex),
            }}
          />
        </Link>
      </Art>
      <TextBlock size={size}>
        <PillRow
          pills={pillsFor(event)}
          collection={
            named ? (
              <CollectionName
                name={event.backlogName!}
                username={event.author.username}
                backlogId={event.backlogId}
              />
            ) : undefined
          }
        />
        <Title title={event.title} tail={tail} />
        {event.reviewBody !== null && (
          <ReviewBody body={event.reviewBody} hasSpoiler={event.hasSpoiler} />
        )}
      </TextBlock>
    </StackCard>
  );
}

function ReviewBody({ body, hasSpoiler }: { body: string; hasSpoiler: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (!hasSpoiler || revealed) return <p className={`mt-0.5 ${BODY}`}>{body}</p>;
  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="relative mt-0.5 block w-full text-left transition-opacity active:opacity-70"
    >
      <span className={`select-none opacity-40 blur-[6px] ${BODY}`}>{body}</span>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[var(--glass-bg)] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text backdrop-blur-[16px]">
        Contiene spoiler · Mostrar
      </span>
    </button>
  );
}

/**
 * N consecutive adds by one author: the covers become a snapping strip that
 * drops in height until the widest one fits the card's width (the mock's
 * `maxRatio` against `100cqw` — which is why the card declares a container).
 * Each cover carries its title and creator underneath; the caption comes out
 * of the art, so the card keeps its tier height.
 */
function BurstCard({ burst, first }: { burst: FeedBurst; first: boolean }) {
  const { author, items } = burst;
  // The widest cover decides how short the strip gets: a square album is 1.
  const maxRatio = items.some((i) => i.mediaType === "album") ? 1 : 2 / 3;
  const lastIndex = items.length - 1;
  return (
    <StackCard hexes={burstHexes(burst)} size="M" first={first}>
      <AuthorPill
        username={author.username}
        avatarUrl={author.avatarUrl}
        avatarHexes={author.avatarHexes}
        trailing={burst.when}
      />
      <Art>
        {/* A size container: the covers take the art's height minus their caption
            (`BURST_CAPTION`), capped so the widest one still fits the width. */}
        <div className="flex h-full w-full items-center [container-type:size]">
          <div
            className="bl-scroll -mx-5 flex w-auto flex-none items-start gap-3.5 overflow-x-auto overflow-y-hidden px-5 [scroll-padding-inline:20px] [scroll-snap-type:x_mandatory]"
            style={{ ["--burst-h" as string]: `min(100cqh - ${BURST_CAPTION}px, (100cqw + 40px) / ${maxRatio})` }}
          >
            {items.map((e, i) => {
              const ratio = e.mediaType === "album" ? 1 : 2 / 3;
              // Artist for music, studio/network for video; the format when there's none.
              const sub = e.byline ?? e.mediaTypeLabel;
              return (
                <Link
                  key={e.id}
                  href={`/item/${e.catalogItemId}`}
                  aria-label={sub ? `${e.title}, ${sub}` : e.title}
                  className="flex flex-none flex-col bl-press-lg"
                  style={{
                    width: `calc(var(--burst-h) * ${ratio})`,
                    // iOS `BurstSnap`: the first rests at the start, the last at the end, the rest centre.
                    scrollSnapAlign: i === 0 ? "start" : i === lastIndex ? "end" : "center",
                  }}
                >
                  <span
                    aria-hidden
                    className="block w-full flex-none overflow-hidden rounded-[var(--r-cover-l)] bg-surface-2 bg-cover bg-center bg-no-repeat shadow-cover"
                    style={{
                      height: "var(--burst-h)",
                      backgroundImage: e.posterUrl ? `url(${e.posterUrl})` : posterFill(e.paletteHex),
                    }}
                  />
                  <span className="flex flex-col gap-[3px] pt-2" style={{ height: BURST_CAPTION }}>
                    <span className="truncate font-brand text-[16px] italic leading-[1.2] text-text">
                      {e.title}
                    </span>
                    {sub && (
                      <span className="truncate font-mono text-[10px] uppercase leading-[1.2] tracking-[0.08em] text-text-2">
                        {sub}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </Art>
      <TextBlock size="M">
        <PillRow
          pills={[P.bookmark(`Guardó ${items.length} títulos en`)]}
          collection={
            <CollectionName name={burst.backlogName} username={author.username} backlogId={burst.backlogId} />
          }
        />
      </TextBlock>
    </StackCard>
  );
}

/**
 * The suggestion's reason with the work in italic, the rest roman (crítica
 * #37: all-italic hid which part is the work). Of the server's reasons
 * (`getFeedSuggestion`) only "También le obsesiona {título}" names a work.
 */
const REASON_WORK = "También le obsesiona ";
function Reason({ text }: { text: string }) {
  const work = text.startsWith(REASON_WORK) ? text.slice(REASON_WORK.length) : null;
  return (
    <span className="font-brand text-[26px] leading-[1.08] text-pretty text-text">
      {work ? (
        <>
          {REASON_WORK}
          <i>{work}</i>
        </>
      ) : (
        text
      )}
    </span>
  );
}

/**
 * "Sugerencia para ti" — the one non-event card (iOS `FeedCard` `.suggestion`).
 * Three covers fanned behind the words, the middle one (the title the reason
 * names) in front; the card pill where the author chip goes elsewhere; the
 * person as seal 44 + @handle; the honey Seguir.
 */
export function SuggestCard({ s, first = false }: { s: FeedSuggestion; first?: boolean }) {
  const mixed = dominantHexes(s.covers, 4);
  const hexes = mixed.length > 0 ? mixed : sealHexesOf(s.avatarHexes);
  // The named title goes to the centre and to the front; the others flank it.
  const order = s.covers.length >= 3 ? [s.covers[1], s.covers[0], s.covers[2]] : s.covers;
  const front = s.covers.length >= 3 ? 1 : Math.floor(order.length / 2);
  return (
    <StackCard hexes={hexes} size="L" first={first}>
      <div className="flex-none self-start">
        <PillView p={P.users("Sugerencia para ti")} />
      </div>
      <Art>
        {order.map((c, i) => (
          <span
            key={c.catalogItemId}
            role="img"
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[64%] rounded-[var(--r-cover-l)] bg-surface-2 bg-cover bg-center bg-no-repeat shadow-cover"
            style={{
              aspectRatio: aspectOf(c.mediaType),
              zIndex: i === front ? 3 : 1,
              transform: `translate(-50%, -50%) translateX(${(i - front) * 58}px) rotate(${(i - front) * 8}deg)`,
              backgroundImage: c.posterUrl ? `url(${c.posterUrl})` : posterFill(c.paletteHex),
            }}
          />
        ))}
      </Art>
      <TextBlock size="L" capped={false}>
        <Reason text={s.reason} />
        <Link href={`/u/${s.username}`} className="flex items-center gap-3 self-start bl-press">
          <Seal name={s.username} hexes={sealHexesOf(s.avatarHexes)} src={s.avatarUrl} size={44} />
          <span className="truncate text-[17px] font-semibold text-text">@{s.username}</span>
        </Link>
        {s.common && <span className="text-[14px] leading-[1.35] text-pretty text-text-2">{s.common}</span>}
        {/* The real follow; honey, no glow — iOS `FollowButton(.card, honey:)` 44 · 20 · 15. */}
        <FollowButton username={s.username} initialFollowing={false} className="mt-1 self-start" />
      </TextBlock>
    </StackCard>
  );
}
