import Link from "next/link";
import { AdnAvatar } from "@/components/adn-avatar";
import { FollowButton } from "@/components/follow-button";
import { plural } from "@/lib/plural";
import type { SuggestedProfile } from "@/modules/social/types";

/**
 * F3.10 — the two suggestion shapes of the feed's empty states (design 1b/1c).
 * Server components; only the FollowButton inside is client. Both meta lines
 * stay gender-neutral on purpose ("actividad hoy", never "activa/activo" — we
 * don't know anyone's gender and won't guess it from a name).
 */

/** Rich card (1b): identity row + a strip of their recent covers. */
export function SuggestionCard({ s }: { s: SuggestedProfile }) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-surface-1 p-3.5">
      <div className="flex items-center gap-[11px]">
        <Link
          href={`/u/${s.username}`}
          className="flex min-w-0 flex-1 items-center gap-[11px]"
        >
          <AdnAvatar hexes={s.avatarHexes} className="h-[38px] w-[38px]" />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-text">
              @{s.username}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
              {richMeta(s)}
            </span>
          </span>
        </Link>
        <FollowButton username={s.username} initialFollowing={false} />
      </div>
      {s.covers.length > 0 && (
        <div className="flex items-end gap-1.5">
          {s.covers.map((c, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007: never proxy)
            <img
              key={i}
              src={c.posterUrl}
              alt=""
              className={`w-[54px] flex-none rounded-lg object-cover ${
                c.mediaType === "album" ? "h-[54px]" : "h-[81px]"
              }`}
            />
          ))}
          {s.moreCount > 0 && (
            <span className="pb-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
              +{s.moreCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact row (1c): for "gente que sí está activa". */
export function SuggestionRow({ s }: { s: SuggestedProfile }) {
  return (
    <div className="flex items-center gap-[11px] rounded-[14px] bg-surface-1 py-[11px] pl-3.5 pr-3">
      <Link
        href={`/u/${s.username}`}
        className="flex min-w-0 flex-1 items-center gap-[11px]"
      >
        <AdnAvatar hexes={s.avatarHexes} className="h-[34px] w-[34px]" />
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-text">
            @{s.username}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-3">
            {compactMeta(s)}
          </span>
        </span>
      </Link>
      <FollowButton username={s.username} initialFollowing={false} size="sm" />
    </div>
  );
}

function richMeta(s: SuggestedProfile): string {
  const parts = [
    s.isFounder ? "Fundador" : null,
    `${s.backlogCount} ${plural(s.backlogCount, "backlog", "backlogs")}`,
    `${s.followerCount} ${plural(s.followerCount, "seguidor", "seguidores")}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function compactMeta(s: SuggestedProfile): string {
  const parts = [
    s.isFounder ? "Fundador" : null,
    `${s.backlogCount} ${plural(s.backlogCount, "backlog", "backlogs")}`,
    s.lastActive ? `actividad ${s.lastActive}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
