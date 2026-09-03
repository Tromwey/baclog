import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { legibleAdnPair } from "@/modules/reviews/format";
import { signOutAction } from "@/app/actions/account-actions";
import { BackButton } from "@/components/ui";
import { InstallAppRow } from "@/app/(app)/perfil/install-app-row";
import { SettingsForm } from "./settings-form";

/**
 * F3.10 (design 2b) — what moved behind /perfil's ajustes chip: install,
 * the whole edit form (name, service, @handle y visibilidad, avisos), the
 * admin-only Torre de control entry and sign out. /perfil itself is the
 * public-profile-shaped screen now.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  // F3.11 — the orb the photo picker falls back to (same pair the viewer's
  // own review card uses).
  const avatarHexes = legibleAdnPair(await getUserPalette(user.id, 2));
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-[22px] pb-dock-clearance pt-[calc(24px+env(safe-area-inset-top))] text-text">
      <BackButton href="/perfil" />

      <header className="pb-2 pt-[18px]">
        <h1 className="font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.02em]">
          Ajustes
        </h1>
      </header>

      {/* Self-hides when already installed (client component). */}
      <div className="mt-3 overflow-hidden rounded-[22px] bl-glass">
        <InstallAppRow />
      </div>

      <SettingsForm
        initialName={user.name ?? ""}
        initialAvatarUrl={user.image}
        avatarHexes={avatarHexes}
        initialService={user.preferredService}
        email={user.email}
        initialUsername={user.username}
        initialIsPublic={user.isPublic}
        initialNotifyReleases={user.notifyReleases}
      />

      {/* Torre de control — admin-only (nav-reachability del portal /admin) */}
      {user.isAdmin && (
        <>
          <div className="mb-[13px] mt-[26px] font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
            Solo founder
          </div>
          <Link
            href="/admin"
            className="relative flex items-center gap-[13px] overflow-hidden rounded-[22px] bl-glass px-[15px] py-[14px] transition-colors hover:bg-white/[0.045]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-bg">
              <ControlTowerGlyph />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-sans text-[15px] font-semibold text-text">
                Torre de control
              </span>
              <span className="mt-[3px] block font-mono text-[9.5px] uppercase tracking-[0.06em] text-text-3">
                Solo tú lo ves · founder
              </span>
            </span>
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
            <ChevronRight size={18} className="shrink-0 text-text-3" />
          </Link>
        </>
      )}

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
    </main>
  );
}

/** Radar/tower glyph from the Torre de Control design (bespoke, not lucide). */
function ControlTowerGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 16a8 8 0 0 1 16 0"
        stroke="var(--accent)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 16 16.6 10.8"
        stroke="var(--accent)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1.7" fill="var(--accent)" />
      <path
        d="M7.2 14.2h.01M12 12.6h.01M16.8 14.2h.01"
        stroke="var(--text-3)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
