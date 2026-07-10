import Link from "next/link";
import { requireUser } from "@/auth";
import { AuraField, ONBOARDING_AURA } from "@/components/ui";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { SPARKLE_PATH, GLYPH_VIEWBOX } from "@/components/glyph-paths";
import { NewBacklogTrigger } from "./new-backlog-button";
import { LensAccess } from "./lens-access";
import { BacklogShelves, type Shelf } from "./backlog-shelves";

export default async function BacklogsPage() {
  const user = await requireUser();
  const list = await getBacklogsForUser(user.id);

  if (list.length === 0) return <FirstUse />;

  const shelves: Shelf[] = list.map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
    paletteHex: b.paletteHex,
  }));

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <header className="px-5 pb-1 pt-[calc(44px+env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[32px] font-extrabold leading-none tracking-[-0.02em]">
              Tus backlogs
            </h1>
            <p className="mt-3 max-w-[32ch] text-[13px] leading-[1.5] text-text-2">
              Colecciones que armas a mano — cine, series y álbumes en un mismo
              backlog.
            </p>
          </div>
          {/* Mock #p1 header actions: flame + chevron only — creating lives in
              the "Nuevo estante" ghost card that closes the shelf list. */}
          <div className="mt-1 shrink-0">
            <LensAccess />
          </div>
        </div>
      </header>

      <BacklogShelves shelves={shelves} />
    </main>
  );
}

/**
 * First-use screen (mock #p8, HANDOFF §8): no header actions, a muted fixed-
 * color aura (there's no content ADN to drive one yet — AuraField would fall
 * back to lima, which is exactly what the mock avoids here), one lima CTA
 * into the create modal and one dark CTA into Discover, then the gesture
 * coach marks — the row model, said once before any rows exist.
 */
function FirstUse() {
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
        <h1 className="mt-[22px] font-display text-[36px] font-extrabold leading-none tracking-[-0.025em]">
          Empieza tu backlog.
        </h1>
        <p className="mt-3.5 max-w-[26ch] font-serif text-[20px] italic leading-[1.25] text-text-2">
          Guarda lo que ves, escuchas y no puedes soltar — en un solo lugar.
        </p>
      </div>

      <div className="relative flex flex-col gap-2.5 px-5 pt-8">
        <NewBacklogTrigger className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-[15px] text-[15px] font-semibold text-bg">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
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
