import Link from "next/link";
import { requireUser } from "@/auth";
import { getFollowCounts, getPeoplePage } from "@/modules/social/queries";
import { BackButton } from "@/components/ui";
import { plural } from "@/lib/plural";
import { PeopleList } from "./people-list";

/**
 * 20e Seguidores y siguiendo — the shared shell of /perfil/seguidores and
 * /perfil/siguiendo: Volver and your @ in mono on the 64 row, the glass
 * segmented pair (two links, not client tabs — each side is its own URL),
 * then the 72 rows. Always the session user's own lists; there is no public
 * route to anyone else's (F3.10: counts public, lists private).
 *
 * The mock's field filters the list in place; the product has no in-list
 * search, so the field is the door to Tu gente (/feed/gente), which searches
 * every public profile. The mock's "Que también sigues" / "N en común" need
 * an overlap read the product doesn't make — the row says what it knows.
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
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="flex flex-col gap-4 px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <BackButton href="/perfil" className="h-11! w-11!" />
          {user.username && (
            <span className="font-mono text-[12px] text-text-2">@{user.username}</span>
          )}
        </div>

        <nav aria-label="Tu gente" className="flex gap-1 rounded-full bg-[var(--glass-bg)] p-[5px]">
          <Tab href="/perfil/seguidores" active={mode === "followers"}>
            {counts.followers} {plural(counts.followers, "seguidor", "seguidores")}
          </Tab>
          <Tab href="/perfil/siguiendo" active={mode === "following"}>
            {counts.following} siguiendo
          </Tab>
        </nav>

        <Link
          href="/feed/gente"
          className="flex h-12 items-center gap-2.5 rounded-full bg-[var(--glass-bg)] px-4 text-[16px] text-text-2 bl-press hover:bg-white/[0.12]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          Buscar gente
        </Link>

        {page.people.length === 0 && page.privateCount === 0 ? (
          <div className="flex flex-col gap-2 pt-8">
            <p className="font-brand text-[28px] leading-[1.1] text-text text-balance">
              {mode === "following" ? "todavía no sigues a nadie." : "todavía nadie te sigue."}
            </p>
            <p className="text-[15px] leading-[1.5] text-pretty text-text-2">
              {mode === "following"
                ? "Busca a quien comparte tus obsesiones por su @usuario o nombre."
                : "Comparte tu perfil para que tu gente te encuentre."}
            </p>
          </div>
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
      className={`flex-1 rounded-full py-[11px] text-center text-[14px] transition-colors active:bg-white/[0.12] ${
        active ? "bg-white/10 font-semibold text-text" : "font-medium text-text-2 hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}
