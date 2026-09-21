import { FollowButton } from "@/components/follow-button";
import { dominantHexes } from "@/modules/backlog/palette";
import type { FeedSuggestion } from "@/modules/social/types";
import { PaletteGlow } from "@/components/ui/palette-glow";
import { AuthorPill } from "./feed-card";

/**
 * Feed v3 — "Quizá quieras seguir", the one non-event card of a populated
 * feed (design 06 · Sugerencia de seguir). Identity on the left (the shared
 * AuthorPill labelled "Sugerencia", the follows you share, the serif reason,
 * the follow pill), a fan of three of their covers on the right, all over a
 * glow mixed from those covers. Plain data in, the FollowButton is the only
 * state.
 *
 * The fan: each cover rotates ±9° around its bottom edge from the middle one,
 * stepping 30px sideways and 8px down — the mock's geometry, generalized: the
 * mock always has three covers; a library with one or two must not leave a
 * lone cover parked in a corner, so the group is centered in the 150px box
 * for whatever count it has (the widest cover drives the width).
 */

const FAN_BOX = 150;
const FAN_STEP = 30;
const fanWidth = (mediaType: FeedSuggestion["covers"][number]["mediaType"]) =>
  mediaType === "album" ? 96 : 72;
export function SuggestCard({ s }: { s: FeedSuggestion }) {
  const mixed = dominantHexes(s.covers, 4);
  const hexes = mixed.length > 0 ? mixed : s.avatarHexes;
  const n = s.covers.length;
  const center = (n - 1) / 2;
  const widest = Math.max(0, ...s.covers.map((c) => fanWidth(c.mediaType)));
  const fanBase = Math.max(0, (FAN_BOX - (widest + (n - 1) * FAN_STEP)) / 2);
  return (
    <article className="relative isolate flex items-center gap-4 px-5 py-1.5">
      <PaletteGlow hexes={hexes} opacity={0.35} angle={110} className="inset-x-0 -inset-y-5" />
      <span className="relative flex min-w-0 flex-1 flex-col gap-2.5">
        <AuthorPill
          username={s.username}
          initial={s.initial}
          avatarUrl={s.avatarUrl}
          avatarHexes={s.avatarHexes}
          trailing="Sugerencia"
          className="self-start"
        />
        {s.common && (
          <span className="text-[13px] leading-[1.3] text-text-2">{s.common}</span>
        )}
        <span className="font-serif text-[22px] italic leading-[1.1] text-pretty text-text">
          {s.reason}
        </span>
        <FollowButton
          username={s.username}
          initialFollowing={false}
          variant="glass"
          className="self-start"
        />
      </span>
      {s.covers.length > 0 && (
        <span aria-hidden className="relative h-[150px] w-[150px] flex-none">
          {s.covers.map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
            <img
              key={c.posterUrl}
              src={c.posterUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className={`absolute h-24 origin-bottom rounded-[10px] object-cover shadow-[0_16px_36px_-10px_rgba(0,0,0,.8),inset_0_1px_0_rgba(255,255,255,.2)] ${
                c.mediaType === "album" ? "w-24" : "w-[72px]"
              }`}
              style={{
                right: `${fanBase + (n - 1 - i) * FAN_STEP}px`,
                top: `${Math.abs(i - center) * 8 + 8}px`,
                zIndex: n - Math.round(Math.abs(i - center)),
                transform: `rotate(${(i - center) * 9}deg)`,
              }}
            />
          ))}
        </span>
      )}
    </article>
  );
}
