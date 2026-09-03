import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { glassChipClass } from "@/components/ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { plural } from "@/lib/plural";
import type { UserStats } from "@/modules/backlog/queries";
import { ShelvesSection } from "./edit-shelves";
import { ShareProfileChip } from "./share-profile-chip";

/**
 * Presentation for /perfil (F3.10, design 2a). The tab stopped being a
 * settings list: it IS your public profile — identity, counts, tu gente and
 * your backlogs — with two glass chips up top (compartir · ajustes). What used
 * to live here (install, edit, admin, sign out) moved behind the ajustes chip
 * (/settings, design 2b). Pure server component.
 */
export function PerfilScreen({
  name,
  username,
  avatarUrl,
  isPublic,
  stats,
  palette,
  followCounts,
  backlogs,
}: {
  name: string;
  username: string | null;
  /** F3.11 — the photo; null keeps the ADN orb. */
  avatarUrl: string | null;
  /** Gates the share chip and the @handle link — a private profile's public
   *  URL 404s, and offering to share a dead link is worse than no chip. */
  isPublic: boolean;
  stats: UserStats;
  palette: string[];
  followCounts: { following: number; followers: number };
  backlogs: {
    id: string;
    name: string;
    itemCount: number;
    paletteHex: string[];
    isPublic: boolean;
    showOnProfile: boolean;
  }[];
}) {
  const publicUrl = username && isPublic ? `/u/${username}` : null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-[22px] pb-dock-clearance pt-[calc(30px+env(safe-area-inset-top))] text-text">
      {/* Header chips — compartir · ajustes (design 2a). */}
      <div className="flex justify-end gap-2">
        {username && isPublic && <ShareProfileChip username={username} />}
        <Link href="/settings" aria-label="Ajustes" className={glassChipClass}>
          <SlidersHorizontal size={19} strokeWidth={1.9} />
        </Link>
      </div>

      {/* Identity */}
      <div className="flex flex-col items-center pt-[22px] text-center">
        <ProfileAvatar
          src={avatarUrl}
          palette={palette}
          seed={33}
          className="h-24 w-24 shadow-[0_12px_34px_rgba(0,0,0,0.55)]"
        />
        <div className="mt-[18px] font-serif text-[34px] italic leading-none">
          {name || "Sin nombre"}
        </div>
        {/* El @handle reemplaza al baclog.app/… (design t2). When the page is
            live, the handle IS the path to it — the replaced "Ver perfil
            público" row's job, kept without re-adding the row. */}
        <div className="mt-[10px] font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
          {publicUrl ? (
            <Link
              href={publicUrl}
              title="Ver tu perfil público"
              className="transition-colors hover:text-text"
            >
              @{username}
            </Link>
          ) : username ? (
            `@${username}`
          ) : (
            <Link href="/settings" className="transition-colors hover:text-text">
              reclama tu @handle
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-[26px] flex overflow-hidden rounded-[22px] bl-glass">
        <Stat value={stats.totalItems} label={plural(stats.totalItems, "TÍTULO", "TÍTULOS")} divider />
        <Stat value={stats.totalBacklogs} label={plural(stats.totalBacklogs, "BACKLOG", "BACKLOGS")} divider />
        <Stat value={stats.obsesiones} label={plural(stats.obsesiones, "OBSESIÓN", "OBSESIONES")} />
      </div>

      {/* Tu gente (F3.10) — counts here, the LISTS are behind the rows and
          only ever rendered for you (counts public, lists private). */}
      <div className="mb-[13px] mt-[30px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
        Tu gente
      </div>
      <div className="overflow-hidden rounded-[22px] bl-glass">
        <PeopleRow
          href="/perfil/siguiendo"
          icon={<FollowingGlyph />}
          label="A quién sigues"
          count={followCounts.following}
          divider
        />
        <PeopleRow
          href="/perfil/seguidores"
          icon={<FollowersGlyph />}
          label="Quién te sigue"
          count={followCounts.followers}
        />
      </div>

      {/* Tus backlogs — the ESCAPARATE (F3.10.1): only public backlogs chosen
          for the profile, exactly what a visitor sees on /u/{handle}. Section,
          Editar chip and the sheet live in ONE client component so every
          affordance opens the same editor; /backlogs stays the workbench. */}
      {backlogs.length > 0 && <ShelvesSection backlogs={backlogs} />}

      <div className="mt-[26px] text-center font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-3">
        Baclog · tu recibo de gusto
      </div>
    </main>
  );
}

function PeopleRow({
  href,
  icon,
  label,
  count,
  divider,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  divider?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-[13px] px-[15px] py-[14px] transition-colors hover:bg-white/[0.045] ${
        divider ? "border-b border-white/[0.07]" : ""
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.07] text-text">
        {icon}
      </span>
      <span className="flex-1 font-sans text-[14.5px] font-medium">{label}</span>
      <span className="font-mono text-[13px] text-text-2">{count}</span>
      <ChevronRight size={18} className="text-text-3" />
    </Link>
  );
}

/* Bespoke FILLED glyphs from the design (2a) — the feed glyph for "a quién
   sigues", its mirrored two-heads sibling for "quién te sigue". */

function FollowingGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="8" cy="12" r="4.2" />
      <rect x="14.4" y="7.6" width="5.6" height="3.2" rx="1.6" />
      <rect x="14.4" y="13.2" width="3.8" height="3.2" rx="1.6" />
    </svg>
  );
}

function FollowersGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="9" r="3.6" />
      <path d="M3.4 18.6a5.6 5.6 0 0111.2 0z" />
      <circle cx="17.6" cy="10.4" r="2.6" opacity=".55" />
      <path d="M13.6 18.6a4 4 0 018 0z" opacity=".55" />
    </svg>
  );
}

function Stat({
  value,
  label,
  divider,
}: {
  value: number;
  label: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`relative flex-1 py-[15px] text-center ${
        divider ? "border-r border-white/[0.08]" : ""
      }`}
    >
      <div className="font-display text-2xl font-extrabold tracking-[-0.02em]">
        {value}
      </div>
      <div className="mt-[5px] font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-2">
        {label}
      </div>
    </div>
  );
}
