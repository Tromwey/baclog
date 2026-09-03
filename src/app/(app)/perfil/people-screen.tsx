import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/auth";
import { getFollowCounts, getPeoplePage } from "@/modules/social/queries";
import { BackButton, ScreenHeader, glassChipClass } from "@/components/ui";
import { PeopleList } from "./people-list";

/**
 * F3.10 (design 1i) — the shared shell of /perfil/siguiendo and
 * /perfil/seguidores: back chip, Tu gente header, the segmented pair (two
 * links, not client tabs — each side is its own URL) and the list. Always the
 * session user's own lists; there is no public route to anyone else's.
 */
export async function PeopleScreen({
  mode,
}: {
  mode: "following" | "followers";
}) {
  const user = await requireUser();
  const [counts, page] = await Promise.all([
    getFollowCounts(user.id),
    getPeoplePage(user.id, mode),
  ]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      {/* Revamp UI (2026-09-03): the back chip and the search chip on the
          mock's header row, then the one screen title. */}
      <div className="flex items-center justify-between px-5 pt-[calc(12px+env(safe-area-inset-top))]">
        <BackButton href="/perfil" />
        <Link
          href="/feed/gente"
          aria-label="Buscar gente"
          className={glassChipClass}
        >
          <UserPlus size={18} />
        </Link>
      </div>
      <ScreenHeader
        title={mode === "following" ? "A quién sigues" : "Quién te sigue"}
        className="pt-[18px]!"
      />

      <div className="px-5 pb-10">
        <div className="flex gap-1.5 rounded-full bg-surface-2 p-[5px]">
          <Tab href="/perfil/siguiendo" active={mode === "following"}>
            Siguiendo {counts.following}
          </Tab>
          <Tab href="/perfil/seguidores" active={mode === "followers"}>
            Seguidores {counts.followers}
          </Tab>
        </div>

        {page.people.length === 0 && page.privateCount === 0 ? (
          <p className="mt-6 text-[14.5px] leading-[1.52] text-pretty text-text-2">
            {mode === "following" ? (
              <>
                Todavía no sigues a nadie.{" "}
                <Link
                  href="/feed/gente"
                  className="text-text underline-offset-2 hover:underline"
                >
                  Busca a alguien
                </Link>{" "}
                por su @handle o nombre.
              </>
            ) : (
              "Todavía nadie te sigue. Comparte tu perfil para que te encuentren."
            )}
          </p>
        ) : (
          <PeopleList
            mode={mode}
            initialPeople={page.people}
            initialCursor={page.nextCursor}
            privateCount={page.privateCount}
          />
        )}
      </div>
    </main>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 rounded-full py-[9px] text-center font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-text-3 hover:text-text-2"
      }`}
    >
      {children}
    </Link>
  );
}
