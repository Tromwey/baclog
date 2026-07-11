import Link from "next/link";
import { fetched, requireAdmin } from "@/modules/admin/guard";
import { runHealthChecks, STATUS_WORD } from "@/modules/admin/checks";
import { AdminTabs } from "./tabs";
import { STATUS_BG_CLASS, STATUS_TEXT_CLASS } from "./ui";

/**
 * Torre de Control — the operator portal chrome. Gates the WHOLE /admin
 * segment on users.isAdmin (404 for everyone else — no oracle; each page
 * re-checks anyway, defense in depth). NOT gated on isFounder: that badge is
 * auto-granted to the whole first-100 cohort (F3.2). Header: back to Perfil,
 * title, and the global health pill (semáforo) linking into Salud.
 * runHealthChecks is React-cached, so the Salud tab shares this execution
 * within a request.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const health = await fetched(runHealthChecks());
  const status = health.ok ? health.data.status : "none";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-[14px] pb-12 pt-[calc(14px+env(safe-area-inset-top))] text-text">
      {/* No dock here: NavDock returns null on /admin (hard route boundary). */}
      <div className="flex items-center gap-[11px] px-[2px] pb-3 pt-2">
        <Link
          href="/perfil"
          aria-label="Volver al perfil"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-surface-2 pb-[2px] text-xl leading-none text-text"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-3">
            Baclog · /admin
          </div>
          <div className="font-display text-[19px] font-extrabold leading-[1.05] tracking-[-0.01em]">
            Torre de control
          </div>
        </div>
        <Link
          href="/admin/salud"
          className="flex shrink-0 items-center gap-[7px] rounded-full bg-surface-2 px-3 py-2"
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_BG_CLASS[status]}`} />
          <span
            className={`font-mono text-[10px] tracking-[0.06em] ${STATUS_TEXT_CLASS[status]}`}
          >
            {STATUS_WORD[status]}
          </span>
        </Link>
      </div>

      <AdminTabs />
      {children}
    </div>
  );
}
