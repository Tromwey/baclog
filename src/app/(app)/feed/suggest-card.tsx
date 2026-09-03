import Link from "next/link";
import { AdnAvatar } from "@/components/adn-avatar";
import { FollowButton } from "@/components/follow-button";
import { dominantHexes } from "@/modules/backlog/palette";
import type { FeedSuggestion } from "@/modules/social/types";
import { FeedGlow } from "./feed-glow";

/**
 * Feed v3 — "Quizá quieras seguir", the one non-event card of a populated
 * feed (design 06 · Sugerencia de seguir). Identity on the left (eyebrow,
 * 40px orb + @handle + the follows you share, the serif reason, the follow
 * pill), a fan of three of their covers on the right, all over a glow mixed
 * from those covers. Plain data in, the FollowButton is the only state.
 *
 * The fan: each cover rotates ±9° around its bottom edge from the middle one,
 * stepping 30px sideways and 8px down — the mock's geometry verbatim.
 */
export function SuggestCard({ s }: { s: FeedSuggestion }) {
  const mixed = dominantHexes(s.covers, 4);
  const hexes = mixed.length > 0 ? mixed : s.avatarHexes;
  return (
    <article className="relative flex items-center gap-4 px-5 py-1.5">
      <FeedGlow hexes={hexes} opacity={0.35} className="inset-x-0 -inset-y-5" />
      <span className="relative flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-3">
          Quizá quieras seguir
        </span>
        <Link href={`/u/${s.username}`} className="flex items-center gap-2.5">
          <AdnAvatar
            hexes={s.avatarHexes}
            initial={s.initial}
            src={s.avatarUrl}
            className="h-10 w-10 text-[13px] shadow-[0_10px_24px_-8px_rgba(0,0,0,.7)]"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-semibold text-text">@{s.username}</span>
            {s.common && <span className="truncate text-xs text-text-3">{s.common}</span>}
          </span>
        </Link>
        <span className="font-serif text-[22px] italic leading-[1.1] text-pretty text-text">
          {s.reason}
        </span>
        <FollowButton username={s.username} initialFollowing={false} className="self-start" />
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
                c.mediaType === "album" ? "w-24" : "w-16"
              }`}
              style={{
                right: `${(2 - i) * 30 + 6}px`,
                top: `${Math.abs(i - 1) * 8 + 8}px`,
                zIndex: i === 1 ? 3 : 1,
                transform: `rotate(${(i - 1) * 9}deg)`,
              }}
            />
          ))}
        </span>
      )}
    </article>
  );
}
