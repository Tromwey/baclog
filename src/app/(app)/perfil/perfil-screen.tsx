import Link from "next/link";
import { ChevronRight, LogOut, Pencil, Share2 } from "lucide-react";
import { AuraField } from "@/components/ui";
import { signOutAction } from "@/app/actions/account-actions";
import { plural } from "@/lib/plural";
import type { UserStats } from "@/modules/backlog/queries";
import { InstallAppRow } from "./install-app-row";

/**
 * Presentation for /perfil (M3.5). Pure server component: identity over an ADN
 * orb, a glass stats card, a glass settings list (editing lives in /settings,
 * reused as-is), the public-profile link, and sign out via a native
 * <form action={signOutAction}> — no client boundary needed.
 */
export function PerfilScreen({
  name,
  username,
  stats,
  palette,
}: {
  name: string;
  username: string | null;
  stats: UserStats;
  palette: string[];
}) {
  const handleHref = username ? `/u/${username}` : "/settings";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-[22px] pb-dock-clearance pt-[calc(56px+env(safe-area-inset-top))] text-text">
      {/* Identity */}
      <div className="flex flex-col items-center text-center">
        <div className="relative h-24 w-24 overflow-hidden rounded-full bg-bg shadow-[0_12px_34px_rgba(0,0,0,0.55)]">
          <AuraField variant="orb" colors={palette} seed={33} />
        </div>
        <div className="mt-[18px] font-serif text-[34px] italic leading-none">
          {name || "Sin nombre"}
        </div>
        <div className="mt-[10px] font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
          {username ? `@${username} · baclog.app/${username}` : "reclama tu @handle"}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-[26px] flex overflow-hidden rounded-[22px] bl-glass">
        <Stat value={stats.totalItems} label={plural(stats.totalItems, "TÍTULO", "TÍTULOS")} divider />
        <Stat value={stats.totalBacklogs} label={plural(stats.totalBacklogs, "BACKLOG", "BACKLOGS")} divider />
        <Stat value={stats.obsesiones} label={plural(stats.obsesiones, "OBSESIÓN", "OBSESIONES")} />
      </div>

      {/* Ajustes */}
      <div className="mb-[13px] mt-[30px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
        Ajustes
      </div>
      <div className="overflow-hidden rounded-[22px] bl-glass">
        {/* Self-hides when already installed (client component). */}
        <InstallAppRow divider />
        <Row href="/settings" icon={<Pencil size={17} strokeWidth={1.8} />} label="Editar perfil" divider />
        <Row href={handleHref} icon={<Share2 size={17} strokeWidth={1.8} />} label="Ver perfil público" />
      </div>

      {/* Cerrar sesión */}
      <form action={signOutAction} className="mt-[14px] overflow-hidden rounded-[22px] bl-glass">
        <button
          type="submit"
          className="relative flex w-full items-center gap-[13px] px-[15px] py-[14px] text-left transition-colors hover:bg-[rgba(232,132,108,0.06)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(232,132,108,0.14)] text-[#E8846C]">
            <LogOut size={17} strokeWidth={1.8} />
          </span>
          <span className="flex-1 font-sans text-[14.5px] font-semibold text-[#E8846C]">
            Cerrar sesión
          </span>
        </button>
      </form>

      <div className="mt-[22px] text-center font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-3">
        Baclog · tu recibo de gusto
      </div>
    </main>
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

function Row({
  href,
  icon,
  label,
  divider,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
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
      <ChevronRight size={18} className="text-text-3" />
    </Link>
  );
}
