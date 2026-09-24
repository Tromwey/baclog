import Link from "next/link";
import { requireUser } from "@/auth";
import { getUserPalette } from "@/modules/backlog/queries";
import { getObsessions } from "@/modules/backlog/profile-stats";
import { signOutAction } from "@/app/actions/account-actions";
import { BackButton } from "@/components/ui";
import { CHEVRON_RIGHT_PATH } from "@/components/glyph-paths";
import { ProfileAvatar } from "@/components/profile-avatar";
import { InstallAppRow } from "@/app/(app)/perfil/install-app-row";
import { profileHexes } from "@/app/(app)/perfil/profile-hexes";
import { DeleteAccount, PrivacySwitch, ReleasesSwitch } from "./settings-form";
import { SERVICE_LABEL } from "./services";

/**
 * 30a Ajustes (Kura, flujo 11) — behind /perfil's gear. Volver 44, "ajustes"
 * in Newsreader 36, then `--s1` groups (radius 18) of 52 rows under a mono
 * section label: you (seal, name, @, "Editar perfil ›", correo) · privacidad
 * · apps · notificaciones · (founder only) torre de control; and at the foot
 * Cerrar sesión, Borrar cuenta and the version line.
 *
 * Only what the product has (§ "lo que el mock pide y el producto no tiene se
 * omite"): no "Quién ve lo que te obsesiona", no "País para dónde ver", no
 * "Nuevos seguidores" / "Tu recap está listo" notices, no follow approval.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const [palette, obsessions] = await Promise.all([
    getUserPalette(user.id),
    getObsessions(user.id, 12),
  ]);
  const hexes = profileHexes(obsessions, palette);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <BackButton href="/perfil" className="h-11! w-11!" />
      </div>

      <div className="flex flex-col gap-7 px-4 pt-4">
        <h1 className="mx-2 font-brand text-[36px] leading-[1.02] text-text">ajustes</h1>

        <Group>
          <div className="flex min-h-[76px] items-center gap-3.5 pl-4 pr-3.5">
            <ProfileAvatar src={user.image} hexes={hexes} name={user.name || user.username || "·"} size={52} />
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[17px] font-semibold text-text">{user.name || "Sin nombre"}</span>
              {user.username && (
                <span className="truncate font-mono text-[12px] text-text-2">@{user.username}</span>
              )}
            </div>
            <Link
              href="/settings/perfil"
              className="flex min-h-11 flex-none items-center gap-1.5 text-[15px] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
            >
              Editar perfil
              <Chevron />
            </Link>
          </div>
          <Divider />
          <Row title="Correo" value={user.email} />
        </Group>

        <Section label="privacidad">
          <Group>
            {user.username ? (
              <>
                <PrivacySwitch initialIsPublic={user.isPublic} />
                <Divider />
                <Row
                  title="Tu página"
                  value={`baclog.app/${user.username}`}
                  href={user.isPublic ? `/u/${user.username}` : undefined}
                />
              </>
            ) : (
              <Row
                title="Elige tu @usuario"
                note="Sin @usuario, nada tuyo es público."
                href="/settings/perfil"
              />
            )}
          </Group>
        </Section>

        <Section label="apps">
          <Group>
            <Row
              title="Abrir música en"
              value={user.preferredService ? SERVICE_LABEL[user.preferredService] : "Elegir"}
              href="/settings/musica"
            />
            {/* Self-hides (with its hairline) when already installed. */}
            <InstallAppRow dividerTop />
          </Group>
        </Section>

        <Section label="notificaciones">
          <Group>
            <ReleasesSwitch initial={user.notifyReleases} />
          </Group>
        </Section>

        {/* Torre de control — admin-only (nav-reachability of /admin). */}
        {user.isAdmin && (
          <Section label="solo founder">
            <Group>
              <Row title="Torre de control" note="Solo tú la ves." href="/admin" />
            </Group>
          </Section>
        )}

        <div className="flex flex-col items-center gap-1 pt-1">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex min-h-11 items-center text-[16px] font-medium text-text transition-opacity active:opacity-60"
            >
              Cerrar sesión
            </button>
          </form>
          <DeleteAccount confirmWord={user.username ?? user.email} />
          <Link
            href="/creditos"
            className="flex min-h-11 items-center text-[15px] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
          >
            Créditos
          </Link>
          <span className="mt-2 font-mono text-[11px] tracking-[0.08em] text-text-3">蔵 kura</span>
        </div>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{label}</h2>
      {children}
    </section>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">{children}</div>;
}

function Divider() {
  return <span aria-hidden className="ml-4 h-px bg-white/[0.06]" />;
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-text-2" aria-hidden>
      <path d={CHEVRON_RIGHT_PATH} />
    </svg>
  );
}

/** A 52 row: title, optional note, optional value, chevron when it leads somewhere. */
function Row({
  title,
  note,
  value,
  href,
}: {
  title: string;
  note?: string;
  value?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[16px] text-text">{title}</span>
        {note && <span className="text-[13px] leading-[1.4] text-text-2">{note}</span>}
      </span>
      {value && <span className="min-w-0 max-w-[55%] truncate text-[15px] text-text-2">{value}</span>}
      {href && <Chevron />}
    </>
  );
  const cls = "flex min-h-[52px] items-center gap-3 py-2 pl-4 pr-3.5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors active:bg-white/[0.06]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
