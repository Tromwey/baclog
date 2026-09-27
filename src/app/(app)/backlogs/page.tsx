import Link from "next/link";
import { requireUser } from "@/auth";
import { CoachNote, ScreenHeader } from "@/components/ui";
import { CHIP_44 } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { KIcon } from "@/components/kura/icons";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import { getShelvesForUser } from "@/modules/backlog/shelves";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import { getRenderInstant } from "@/modules/catalog/release";
import { shouldAnnounce } from "@/modules/announcements";
import { getReviewInvitation } from "@/modules/reviews/queries";
import { NovedadesModal } from "@/components/novedades-modal";
import { NewBacklogTrigger } from "./new-backlog-button";
import { CollectionCards } from "./collection-cards";

/**
 * /backlogs = Tus colecciones (Colecciones formalizado · 1a, 2026-09-27). The
 * route keeps its product name; everything the user reads says "colección".
 *
 * The carousel of fans (collection-cards.tsx) owns the whole screen — its
 * header (Compartir + Nueva colección) and its background follow the
 * collection in the centre. Zero collections = 6a.
 */
export default async function BacklogsPage() {
  const user = await requireUser();
  const [shelves, now] = await Promise.all([
    getShelvesForUser(user.id),
    getRenderInstant(),
  ]);

  if (shelves.length === 0) return <NoCollections />;

  // Novedades (modules/announcements.ts + components/novedades-modal). Gated
  // FIRST so the extra read only happens for an account that can see it.
  // F3.9: the sheet needs a title this reader already reacted to and hasn't
  // written about; no such title = no sheet (the announcement stays unspent).
  const announce = shouldAnnounce(user);
  const [invitation, upcoming, counts] = await Promise.all([
    announce ? getReviewInvitation(user.id) : Promise.resolve(null),
    getLibraryUpcoming(user.id, now),
    getFirstRunCounts(user.id),
  ]);
  const coach = firstRunCoach(counts);

  return (
    <>
      {invitation && <NovedadesModal invitation={invitation} />}
      <CollectionCards
        shelves={shelves}
        upcoming={upcoming}
        now={now}
        username={user.username}
        profilePublic={user.isPublic}
        coach={
          // First-run moment 1 (first-run.ts): the library is still the
          // onboarding picks. Says what those picks already did and where the
          // next title comes from. Lifts itself on the first add or judgement.
          coach.shelves && (
            <CoachNote className="mx-5 mt-[30px]">
              Empezaste con lo que te obsesiona: eso ya afina{" "}
              <Link
                href="/descubrir"
                className="text-text-2 underline underline-offset-2 transition-opacity active:opacity-60"
              >
                Descubrir
              </Link>
              . Ahí encuentras lo siguiente y lo guardas en una colección.
            </CoachNote>
          )
        }
      />
    </>
  );
}

/**
 * 6a Sin colecciones (Colecciones formalizado, replaces 15a's "tu primera"
 * spine): the ghost fan — three empty slots, the dashed "+" in front, which
 * is the way in — then the phrase in Newsreader 34 with its full stop, one
 * line of body and the glass "Nueva colección". The copy is today's. Since
 * onboarding v2 a new account never lands here (elige tres creates the first
 * collection) — it's the screen for someone who deleted every collection.
 */
function NoCollections() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-dock-clearance text-text">
      <ScreenHeader
        title="tus colecciones"
        action={
          <NewBacklogTrigger ariaLabel="Nueva colección" className={CHIP_44}>
            <KIcon name="plus" size={18} />
          </NewBacklogTrigger>
        }
      />
      <div className="flex flex-col items-center gap-3.5 px-7 pt-[70px] text-center">
        <NewBacklogTrigger ariaLabel="Nueva colección" className="block bl-press-lg">
          <Fan covers={[]} lead={180} ghost />
        </NewBacklogTrigger>
        <h2 className="mt-4 font-brand text-[34px] font-normal leading-[1.05] [text-wrap:balance]">
          aquí va lo que más vale.
        </h2>
        <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
          Empieza por lo que no puedes dejar de recomendar. Una colección puede
          mezclar cine, series y música.
        </p>
        <NewBacklogTrigger className="mt-1.5 flex h-11 items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-3 pr-4 font-sans text-[15px] font-semibold text-text bl-press">
          <KIcon name="plus" size={18} />
          Nueva colección
        </NewBacklogTrigger>
      </div>
    </main>
  );
}
