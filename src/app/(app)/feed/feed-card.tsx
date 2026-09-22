"use client";

import Link from "next/link";
import { useState } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
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
import { mixToward, rgba, type RGB } from "@/lib/color";
import { dominantHexes } from "@/modules/backlog/palette";
import type { MediaType } from "@/modules/catalog/types";
import type { FeedBurst, FeedCard, FeedEvent, FeedSuggestion } from "@/modules/social/types";

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
 *
 * Founder calls, 2026-09-21: the "Seguir" pill KEEPS the mock's lime glow (an
 * explicit exception to AGENTS.md §7); the v8 greys and Space Mono apply to
 * the feed only (`.feed-v8` in globals.css); film covers stay 3:4 like the
 * rest of the product instead of the mock's 2:3.
 */

/** Sticky header height in the mock — what every card pins under. */
export const HDR_PX = 63;
/** How far a card's body runs past its own height (the mock's EXTB). */
export const EXT_BOTTOM = 120;

export const STICKY_TOP = `calc(${HDR_PX}px + env(safe-area-inset-top))`;

type Tier = { h: number; cap: number; textMax: number };
/** [fixed height, ceiling as a fraction of the screen, max height of the text block] */
const TIER: Record<"L" | "M" | "S", Tier> = {
  L: { h: 620, cap: 0.72, textMax: 180 },
  M: { h: 500, cap: 0.58, textMax: 105 },
  S: { h: 370, cap: 0.44, textMax: 105 },
};

/** The mock's `tint` slider at its default 45% → `k = 1 - .45 * .78`. */
const TINT_K = 1 - (45 / 100) * 0.78;
const TOP_TARGET: RGB = { r: 0x10, g: 0x10, b: 0x13 };
const BOT_TARGET: RGB = { r: 0x0c, g: 0x0c, b: 0x10 };

/** The mock's `ends()`: the palette pair dragged toward black, top and bottom. */
function cardEnds(hexes: readonly string[]): [string, string] {
  const a = hexes[0] ?? "#6C6B76";
  const b = hexes[1] ?? a;
  return [
    mixToward(a, TOP_TARGET, TINT_K),
    mixToward(b, BOT_TARGET, Math.min(1, TINT_K + 0.08)),
  ];
}

export function cardBackground(hexes: readonly string[]): string {
  const [top, bot] = cardEnds(hexes);
  return `linear-gradient(168deg, ${top} 0%, ${bot} 100%)`;
}

/** The colour the page continues in below the last card (the mock's tailBg). */
export function cardTailHex(hexes: readonly string[]): string {
  return cardEnds(hexes)[1];
}

/**
 * Founder call 2026-09-21: the mock fixes film at 2:3, but every other cover
 * in the product is 3:4 and the feed is not worth splitting that in two.
 */
const aspectOf = (m: MediaType) => (m === "album" ? "1 / 1" : "3 / 4");

/** A card is never lit by nothing: the cover's hexes, else the author's ADN. */
const cardHexes = (e: FeedEvent): readonly string[] =>
  e.paletteHex.length > 0 ? e.paletteHex : e.author.avatarHexes;

/** Where a cover has no art: the palette as a printed gradient. */
function posterFill(hexes: readonly string[]): string | undefined {
  const [a, b = a] = hexes;
  if (!a) return undefined;
  return `radial-gradient(90% 70% at 30% 20%, ${rgba(a, 0.55)} 0%, ${rgba(a, 0)} 70%), linear-gradient(160deg, ${a} 0%, ${b} 100%)`;
}

// ---------- the pill vocabulary ----------

type Pill = { label: string; d: string; color: string; flip?: boolean };

const P = {
  flame: (label: string): Pill => ({ label, d: FLAME_PATH, color: "var(--hot)" }),
  up: (label: string): Pill => ({ label, d: LIKE_PATH, color: "var(--radar)" }),
  down: (label: string): Pill => ({ label, d: LIKE_PATH, color: "var(--text-3)", flip: true }),
  check: (label: string): Pill => ({ label, d: CHECK_FILL_PATH, color: "var(--accent)" }),
  bookmark: (label: string): Pill => ({ label, d: BOOKMARK_PATH, color: "var(--text-2)" }),
  clock: (label: string): Pill => ({ label, d: CLOCK_PATH, color: "var(--radar)" }),
  review: (label: string): Pill => ({ label, d: REVIEW_PATH, color: "var(--text)" }),
  users: (label: string): Pill => ({ label, d: USERS_PATH, color: "var(--text-2)" }),
};

const MARK_PILL = {
  liked: () => P.up("Le gusta"),
  disliked: () => P.down("No le gusta"),
  obsessed: () => P.flame("Le obsesiona"),
} as const;

/**
 * The mock's pill rules. A waiting add REPLACES the "agregó a" pill instead of
 * adding to it: two long pills wrap the row and eat the artwork's height.
 */
function pillsFor(e: FeedEvent): Pill[] {
  const out: Pill[] = [];
  if (e.waiting) out.push(P.clock(`No puede esperar · ${e.waiting}`));
  else if (e.kind === "added")
    out.push(P.bookmark(e.backlogName ? `Agregó a ${e.backlogName}` : "Agregó"));
  else if (e.kind === "completed") out.push(P.check("Completo"));
  else if (e.kind === "obsessed") out.push(P.flame("Le obsesiona"));
  else if (e.kind === "reviewed") out.push(P.review("Reseñó"));

  if (e.mark && e.mark !== "obsessed") out.push(MARK_PILL[e.mark]());
  else if (e.mark === "obsessed" && e.kind !== "obsessed") out.push(MARK_PILL.obsessed());
  return out;
}

function PillRow({ pills }: { pills: Pill[] }) {
  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-[7px]">
      {pills.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--glass-bg)] px-3.5 py-2 font-mono text-[12px] uppercase leading-none tracking-[0.06em] text-text backdrop-blur-[20px] backdrop-saturate-[1.5]"
        >
          <svg
            width="13"
            height="13"
            viewBox={GLYPH_VIEWBOX}
            fill={p.color}
            aria-hidden
            className="flex-none"
            style={p.flip ? { transform: "scaleY(-1)" } : undefined}
          >
            <path d={p.d} />
          </svg>
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ---------- shared chrome ----------

function AuthorPill({
  username,
  initial,
  avatarUrl,
  avatarHexes,
  trailing,
}: {
  username: string;
  initial?: string;
  avatarUrl: string | null;
  avatarHexes: readonly [string, string];
  trailing: string;
}) {
  return (
    <Link
      href={`/u/${username}`}
      className="relative z-10 flex max-w-full flex-none items-center gap-2 self-start rounded-full bg-[var(--glass-bg)] py-1 pl-1 pr-3 backdrop-blur-[20px] backdrop-saturate-[1.5] bl-press"
    >
      <AdnAvatar
        hexes={avatarHexes}
        initial={initial}
        src={avatarUrl}
        className="h-[22px] w-[22px] font-mono text-[11px]"
      />
      <span className="truncate text-[13px] font-semibold text-text">@{username}</span>
      <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
        {trailing}
      </span>
    </Link>
  );
}

/**
 * The card shell: sticky at the header, its own tint, and a body that runs
 * EXT_BOTTOM past its height so the next card never rises over bare page.
 */
function StackCard({
  hexes,
  size,
  children,
}: {
  hexes: readonly string[];
  size: "L" | "M" | "S";
  children: React.ReactNode;
}) {
  const tier = TIER[size];
  return (
    <article
      className="sticky flex flex-col gap-3.5 overflow-hidden rounded-t-[26px] px-5 pb-[142px] pt-[18px] shadow-[0_-1px_0_rgba(255,255,255,.15),0_-24px_46px_rgba(0,0,0,.72)] [container-type:inline-size] [scroll-snap-align:start]"
      style={{
        top: STICKY_TOP,
        height: `calc(min(${tier.h}px, calc(100dvh * ${tier.cap})) + ${EXT_BOTTOM}px)`,
        marginBottom: `-${EXT_BOTTOM}px`,
        background: cardBackground(hexes),
      }}
    >
      {children}
    </article>
  );
}

/** The middle band: the artwork, centred, taking whatever height is left. */
function Art({ children }: { children: React.ReactNode }) {
  return <div className="relative flex min-h-0 flex-1 items-center justify-center">{children}</div>;
}

function TextBlock({ size, children }: { size: "L" | "M" | "S"; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-none flex-col gap-[9px] overflow-hidden"
      style={{ maxHeight: `${TIER[size].textMax}px` }}
    >
      {children}
    </div>
  );
}

function Title({ title, tail }: { title: string; tail: string | null }) {
  return (
    <span className="font-serif text-[26px] italic leading-[1.08] text-pretty text-text">
      {title}
      {tail && <span className="text-text-3">{` · ${tail}`}</span>}
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
  const first = card.items[0]?.paletteHex ?? [];
  const last = card.items[card.items.length - 1]?.paletteHex ?? [];
  if (first.length > 0) return [first[0], last[1] ?? last[0] ?? first[0]];
  const mixed = dominantHexes(card.items, 4);
  return mixed.length > 0 ? mixed : card.author.avatarHexes;
}

// ---------- cards ----------

export function FeedCardView({ card }: { card: FeedCard }) {
  if (card.kind === "burst") return <BurstCard burst={card} />;
  return <EventCard event={card.event} />;
}

/** The mock's tiers: L a review with words, M an obsession or completion, S a quick add. */
function sizeOf(e: FeedEvent): "L" | "M" | "S" {
  if (e.reviewBody) return "L";
  return e.kind === "added" ? "S" : "M";
}

const BODY =
  "text-[15px] leading-[1.5] text-pretty text-text [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden";

function EventCard({ event }: { event: FeedEvent }) {
  const size = sizeOf(event);
  const tail = event.mediaType === "album" ? event.byline : (event.year?.toString() ?? null);
  return (
    <StackCard hexes={cardHexes(event)} size={size}>
      <AuthorPill
        username={event.author.username}
        initial={event.author.initial}
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
            className="block h-full w-full rounded-2xl bg-surface-2 bg-cover bg-center bg-no-repeat shadow-[0_26px_52px_-20px_rgba(0,0,0,.88),inset_0_1px_0_rgba(255,255,255,.16)]"
            style={{
              backgroundImage: event.posterUrl
                ? `url(${event.posterUrl})`
                : posterFill(event.paletteHex),
            }}
          />
        </Link>
      </Art>
      <TextBlock size={size}>
        <PillRow pills={pillsFor(event)} />
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
 */
function BurstCard({ burst }: { burst: FeedBurst }) {
  const { author, items } = burst;
  const first = items[0]?.paletteHex ?? [];
  const last = items[items.length - 1]?.paletteHex ?? [];
  const mixed = dominantHexes(items, 4);
  const hexes =
    first.length > 0
      ? [first[0], last[1] ?? last[0] ?? first[0]]
      : mixed.length > 0
        ? mixed
        : author.avatarHexes;
  // The widest cover decides how short the strip gets: a square album is 1.
  const maxRatio = items.some((i) => i.mediaType === "album") ? 1 : 3 / 4;
  return (
    <StackCard hexes={hexes} size="M">
      <AuthorPill
        username={author.username}
        initial={author.initial}
        avatarUrl={author.avatarUrl}
        avatarHexes={author.avatarHexes}
        trailing={burst.when}
      />
      <Art>
        <div
          className="bl-scroll -mx-5 flex h-full w-auto items-stretch gap-3.5 self-center overflow-x-auto overflow-y-hidden px-5 [mask-image:linear-gradient(90deg,transparent_0,#000_20px,#000_calc(100%-46px),transparent_100%)] [scroll-padding-left:20px] [scroll-snap-type:x_mandatory]"
          style={{ maxHeight: `calc(100cqw / ${maxRatio})` }}
        >
          {items.map((e) => (
            <Link
              key={e.id}
              href={`/item/${e.catalogItemId}`}
              aria-label={e.title}
              className="block h-full flex-none [scroll-snap-align:start] bl-press-lg"
              style={{ aspectRatio: aspectOf(e.mediaType) }}
            >
              <span
                role="img"
                aria-label={e.title}
                className="block h-full w-full overflow-hidden rounded-[14px] bg-surface-2 bg-cover bg-center bg-no-repeat shadow-[0_18px_36px_-16px_rgba(0,0,0,.88),inset_0_1px_0_rgba(255,255,255,.16)]"
                style={{
                  backgroundImage: e.posterUrl ? `url(${e.posterUrl})` : posterFill(e.paletteHex),
                }}
              />
            </Link>
          ))}
        </div>
      </Art>
      <TextBlock size="M">
        <PillRow pills={[P.bookmark(`Agregó ${items.length} títulos a ${burst.backlogName}`)]} />
      </TextBlock>
    </StackCard>
  );
}

/**
 * "Quizá quieras seguir" — the one non-event card. Three covers fanned behind
 * the words, the middle one (the title the reason names) in front.
 */
export function SuggestCard({ s }: { s: FeedSuggestion }) {
  const [following, setFollowing] = useState(false);
  const mixed = dominantHexes(s.covers, 4);
  const hexes = mixed.length > 0 ? mixed : s.avatarHexes;
  // The named title goes to the centre and to the front; the others flank it.
  const order = s.covers.length >= 3 ? [s.covers[1], s.covers[0], s.covers[2]] : s.covers;
  return (
    <StackCard hexes={hexes} size="L">
      <AuthorPill
        username={s.username}
        initial={s.initial}
        avatarUrl={s.avatarUrl}
        avatarHexes={s.avatarHexes}
        trailing="Sugerencia"
      />
      <Art>
        {order.map((c, i) => (
          <span
            key={c.posterUrl}
            role="img"
            aria-hidden
            className="absolute left-1/2 top-1/2 h-[64%] rounded-[14px] bg-surface-2 bg-cover bg-center bg-no-repeat shadow-[0_22px_44px_-18px_rgba(0,0,0,.88),inset_0_1px_0_rgba(255,255,255,.16)]"
            style={{
              aspectRatio: aspectOf(c.mediaType),
              zIndex: i === 1 ? 3 : 1,
              transform: `translate(-50%, -50%) translateX(${(i - 1) * 58}px) rotate(${(i - 1) * 8}deg)`,
              backgroundImage: c.posterUrl ? `url(${c.posterUrl})` : posterFill(c.paletteHex),
            }}
          />
        ))}
      </Art>
      <TextBlock size="L">
        <PillRow pills={[P.users("Sugerencia")]} />
        <Title title={s.reason} tail={null} />
        {s.common && <span className="text-[14px] leading-[1.35] text-text-2">{s.common}</span>}
        <FollowPill
          username={s.username}
          following={following}
          onToggle={() => setFollowing((v) => !v)}
        />
      </TextBlock>
    </StackCard>
  );
}

/**
 * Founder call 2026-09-21: this keeps the mock's lime glow — an explicit,
 * documented exception to AGENTS.md §7 ("no coloured glows"), and the only
 * place in the product that has one.
 */
function FollowPill({
  username,
  following,
  onToggle,
}: {
  username: string;
  following: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={following ? `Dejar de seguir a @${username}` : `Seguir a @${username}`}
      onClick={onToggle}
      className="mt-1 self-start rounded-full px-6 py-3.5 text-[16px] font-semibold transition-colors duration-200 bl-press"
      style={
        following
          ? { background: "transparent", color: "var(--text-2)" }
          : { background: "var(--accent)", color: "#0B0B0D", boxShadow: "0 0 24px #D8FF3E1A" }
      }
    >
      {following ? "Siguiendo" : "Seguir"}
    </button>
  );
}
