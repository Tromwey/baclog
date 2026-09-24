import Link from "next/link";
import { AdnAvatar } from "@/components/adn-avatar";
import { FollowButton } from "@/components/follow-button";
import { plural } from "@/lib/plural";
import type { SuggestedProfile } from "@/modules/social/types";

/**
 * F3.10 — a person offered by the feed's empty states and by Tu gente
 * (/feed/gente), in Kura's people row (E1 / 32b): seal 44, @handle 16/500,
 * one mono line of context, and the glass "Seguir" at the right. Server
 * component; only the FollowButton inside is client.
 *
 * The mono line stays gender-neutral on purpose ("actividad hoy", never
 * "activa/activo" — we don't know anyone's gender and won't guess it). The
 * mock's "le obsesiona {título}" / "4 obsesiones en común" would need a
 * per-suggestion read the product doesn't make; it says what it knows.
 */
export function SuggestionRow({ s }: { s: SuggestedProfile }) {
  return (
    <div className="flex min-h-[72px] items-center gap-3.5 rounded-[var(--r-surface)] transition-colors has-[a:active]:bg-white/[0.06]">
      <Link href={`/u/${s.username}`} className="flex min-w-0 flex-1 items-center gap-3.5">
        <AdnAvatar hexes={s.avatarHexes} name={s.name || s.username} src={s.avatarUrl} className="h-11 w-11" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[16px] font-medium text-text">@{s.username}</span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            {suggestionMeta(s)}
          </span>
        </span>
      </Link>
      <FollowButton username={s.username} initialFollowing={false} variant="row" />
    </div>
  );
}

function suggestionMeta(s: SuggestedProfile): string {
  const parts = [
    s.isFounder ? "fundador" : null,
    `${s.backlogCount} ${plural(s.backlogCount, "colección", "colecciones")}`,
    s.lastActive
      ? `actividad ${s.lastActive}`
      : `${s.followerCount} ${plural(s.followerCount, "seguidor", "seguidores")}`,
  ];
  return parts.filter(Boolean).join(" · ");
}
