import Link from "next/link";
import { requireUser } from "@/auth";
import {
  AuraField,
  ONBOARDING_AURA,
  ScreenHeader,
  StepMeter,
  StrokeIcon,
  glassChipClass,
} from "@/components/ui";
import { getShelvesForUser } from "@/modules/backlog/shelves";
import { getLibraryUpcoming } from "@/modules/backlog/library";
import { getRenderInstant } from "@/modules/catalog/release";
import { shouldAnnounce } from "@/modules/announcements";
import { getReviewInvitation } from "@/modules/reviews/queries";
import { NovedadesModal } from "@/components/novedades-modal";
import { PLUS_PATH, SPARKLE_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { NewBacklogTrigger } from "./new-backlog-button";
import { BacklogShelves } from "./backlog-shelves";

/**
 * /backlogs (Revamp UI screen 02, 2026-09-03): "Backlogs" header with the "+"
 * chip, the kind filter (Todos · Cine · Series · Música), the library-wide
 * "No puede esperar" strip and then every backlog as a strip of covers over
 * its palette glow. The lens entry (flame + dropdown) is gone from here — the
 * mock has none; /backlogs/lentes/* keeps working by URL.
 */
export default async function BacklogsPage() {
  const user = await requireUser();
  const [shelves, now] = await Promise.all([
    getShelvesForUser(user.id),
    getRenderInstant(),
  ]);

  if (shelves.length === 0) return <FirstUse name={user.name} />;

  // Novedades (modules/announcements.ts + components/novedades-modal). Gated
  // FIRST so the extra read only happens for an account that can actually see
  // it. Deliberately not on the first-use screen above: someone who hasn't made
  // a backlog yet is already being guided somewhere, and an announcement on top
  // of onboarding is two voices talking at once.
  // F3.9: the sheet needs a title this reader already reacted to and hasn't
  // written about. No such title = no sheet, and the announcement stays unspent
  // (see getReviewInvitation) — it will find them the day they react to
  // something.
  const announce = shouldAnnounce(user);
  const [invitation, upcoming] = await Promise.all([
    announce ? getReviewInvitation(user.id) : Promise.resolve(null),
    getLibraryUpcoming(user.id, now),
  ]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <ScreenHeader
        title="Backlogs"
        action={
          <NewBacklogTrigger ariaLabel="Nuevo backlog" className={glassChipClass}>
            <StrokeIcon d={PLUS_PATH} size={16} strokeWidth={2.4} />
          </NewBacklogTrigger>
        }
      />

      {invitation && <NovedadesModal invitation={invitation} />}

      <BacklogShelves shelves={shelves} upcoming={upcoming} now={now} />
    </main>
  );
}

/**
 * First-use screen (mock #p8, HANDOFF §8): no header actions, a muted fixed-
 * color aura (there's no content ADN to drive one yet — AuraField would fall
 * back to lima, which is exactly what the mock avoids here), one lima CTA
 * into the create modal and one dark CTA into Discover, then the gesture
 * coach marks — the row model, said once before any rows exist. Kept as-is:
 * the Revamp UI mock defers empty states.
 *
 * This screen IS step 1 of the welcome onboarding (no backlogs is the step's
 * definition), so the greeting + meter are unconditional here — reaching it
 * with a backlog is impossible.
 */
function FirstUse({ name }: { name: string | null }) {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden"
      >
        <AuraField layers={[ONBOARDING_AURA]} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,11,13,0.3) 0%, rgba(11,11,13,0.15) 44%, #0B0B0D 92%)",
          }}
        />
      </div>

      <div className="relative px-5 pt-[calc(44px+env(safe-area-inset-top))]">
        {/* The first moment the app can use the name onboarding just captured. */}
        {/* justify-end + mr-auto: the meter stays pinned right even when the
            account has no display name to greet. */}
        <div className="bl-rise flex items-center justify-end gap-3">
          {name && (
            <p className="mr-auto min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-text-2">
              Hola, {name}.
            </p>
          )}
          <StepMeter step={1} />
        </div>
        <h1 className="mt-4 font-display text-[36px] font-extrabold leading-none tracking-[-0.025em]">
          Empieza tu backlog.
        </h1>
        <p className="mt-3.5 max-w-[26ch] font-serif text-[20px] italic leading-[1.25] text-text-2">
          Guarda lo que ves, escuchas y no puedes soltar — en un solo lugar.
        </p>
      </div>

      <div className="relative flex flex-col gap-2.5 px-5 pt-8">
        <NewBacklogTrigger className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-[15px] text-[15px] font-semibold text-bg">
          <StrokeIcon d={PLUS_PATH} size={18} strokeWidth={2} />
          Crear tu primer backlog
        </NewBacklogTrigger>
        <Link
          href="/descubrir"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-surface-2 py-3.5 text-[15px] font-semibold text-text"
        >
          <svg
            width="16"
            height="16"
            viewBox={GLYPH_VIEWBOX}
            fill="currentColor"
            aria-hidden
          >
            <path d={SPARKLE_PATH} />
          </svg>
          Explorar Discover
        </Link>
      </div>

      {/* Coach marks de primer uso (mock #p8, HANDOFF §8): el modelo de
          gestos de la fila, dicho una vez antes de que existan filas. */}
      <div className="relative mx-5 mt-[30px] flex flex-col gap-[11px] border-t border-[#1C1C22] pt-5 font-mono text-[9px] uppercase tracking-[0.05em] text-text-3">
        <div className="flex items-center gap-[9px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 4l14 8-14 8z" />
          </svg>
          Toca una fila para reproducir
        </div>
        <div className="flex items-center gap-[9px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          El chevron abre el ticket del ítem
        </div>
        <div className="flex items-center gap-[9px]">
          <svg width="12" height="12" viewBox={GLYPH_VIEWBOX} fill="currentColor" aria-hidden>
            <path d={SPARKLE_PATH} />
          </svg>
          El destello marca lo que te recomendamos
        </div>
      </div>
    </main>
  );
}
