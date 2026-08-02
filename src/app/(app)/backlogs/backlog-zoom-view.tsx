import Link from "next/link";
import { assertOwnsBacklog } from "@/authz";
import { BacklogHero } from "@/components/backlog-hero";
import { ItemRowRemovable } from "@/components/item-row-removable";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { UpcomingShelf } from "@/components/upcoming-shelf";
import { getRenderInstant, isUpcoming } from "@/modules/catalog/release";
import { getBacklogItems } from "@/modules/backlog/queries";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";
import { dominantHexes } from "@/modules/backlog/palette";
import {
  firstRunStep,
  getFirstRunCounts,
  type FirstRunStep,
} from "@/modules/backlog/first-run";
import { StepMeter } from "@/components/ui";
import { shelfSeed } from "./backlog-shelf-card";
import { ZoomBackButton } from "./zoom-back-button";
import { BacklogMenu } from "./[backlogId]/backlog-menu";

/**
 * Shared data loader for the two zoom twins ([backlogId]/page.tsx and the
 * intercepted @modal/(.)[backlogId]/page.tsx). Ownership check and item fetch
 * run CONCURRENTLY — nothing renders unless the assert resolves, so the authz
 * model is unchanged; the items are just already in flight when it does.
 * Throws assertOwnsBacklog's NotFoundError/UnauthorizedError — each twin maps
 * them to its own recovery (404 vs. redirect back to the list).
 */
export async function loadBacklogZoom(backlogId: string) {
  const itemsP = getBacklogItems(backlogId);
  itemsP.catch(() => {}); // no unhandled rejection if the assert throws first
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const items = await itemsP;
  // Welcome onboarding: standing inside a backlog means backlogs > 0, so the
  // step reduces to the library-wide counts. Fetched AFTER the assert (it's a
  // read for the owner only) but before render, so the guide never flashes in.
  const counts = await getFirstRunCounts(user.id);
  return {
    backlog,
    items,
    paletteHex: dominantHexes(items, 6),
    step: firstRunStep({ backlogs: 1, ...counts }),
    // F3.8 — read the clock HERE (the loader is async; the view below is not)
    // so the shelf and every row's countdown share one instant.
    now: await getRenderInstant(),
  };
}

/**
 * Shelf zoom body (mock #p2/#p7) — hero with the backlog's ADN aura + the
 * read-only item list. Presentational and server-safe; shared by the real
 * /backlogs/[id] page (plain, template.tsx animates it) and the intercepted
 * overlay (`zoom` adds the bl-zoom-aura/-content bloom, the overlay route owns
 * bl-zoom-in on its fixed wrapper).
 */
export function BacklogZoomView({
  backlog,
  items,
  paletteHex,
  step,
  now,
  zoom = false,
}: {
  backlog: { id: string; name: string; vibe: string | null; createdAt: Date };
  items: BacklogItemWithCatalog[];
  /** The backlog's ADN (dominant hexes). Ignored while the backlog is empty. */
  paletteHex: string[];
  /** Welcome onboarding step (0 = activated, no guidance renders). */
  step: FirstRunStep;
  /** The render instant from loadBacklogZoom — every countdown on this screen
   *  is measured from it (see components/countdown.tsx). */
  now: number;
  zoom?: boolean;
}) {
  const hasItems = items.length > 0;
  const content = zoom ? "bl-zoom-content" : "";
  const upcoming = items
    .filter((it) => isUpcoming(it.releaseDate, now))
    .sort((a, b) => a.releaseDate!.getTime() - b.releaseDate!.getTime())
    .map((it) => ({
      catalogItemId: it.catalogItemId,
      title: it.title,
      posterUrl: it.posterUrl,
      releaseDate: it.releaseDate!.toISOString(),
    }));
  // Step 2 = the library is empty account-wide. An ACTIVATED user's empty
  // backlog keeps the placeholder, the serif line and the CTA — only the meter
  // drops, so this screen never advertises a step that isn't theirs.
  const showMeter = step === 2 && !hasItems;
  // Step 3 lands here once the first title exists: name the two gestures that
  // actually unlock the engine, next to the row they apply to.
  const showReactionCoach = step === 3 && hasItems;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      {/* In-browser Safari tints the status-bar band from theme-color — sync
          it to the aura's dominant hue so the hero doesn't cut off in black. */}
      <ThemeColorSync color={hasItems ? paletteHex[0] : null} />

      {/* Shared hero (B disciplinada) — identical to the public twin; the two
          surfaces diverge only in the row density below + the top-bar controls
          (private: back + ⋯ menu). `zoom` carries the intercepted-overlay bloom. */}
      <BacklogHero
        name={backlog.name}
        vibe={backlog.vibe}
        itemCount={items.length}
        year={backlog.createdAt.getFullYear()}
        palette={paletteHex}
        seed={shelfSeed(backlog.id)}
        zoom={zoom}
        controls={
          <>
            <ZoomBackButton />
            <div className="flex items-center gap-3">
              {showMeter && <StepMeter step={2} />}
              <BacklogMenu
                backlogId={backlog.id}
                currentName={backlog.name}
                hasItems={hasItems}
              />
            </div>
          </>
        }
      />

      {hasItems ? (
        <div className={`relative mt-[18px] ${content}`}>
          {/* F3.8 — what hasn't come out yet, nearest first. The rows below
              deliberately DON'T repeat the countdown: a title appears in both
              places, and saying "faltan 5 días" twice on one screen makes the
              shelf look like it's insisting. The shelf is where the wait is
              legible; the row stays a row. */}
          {upcoming.length > 0 && (
            <>
              <UpcomingShelf items={upcoming} initialNow={now} />
              <div className="mx-5 mb-1 mt-5 h-px bg-line" />
            </>
          )}

          {items.map((item, i) => (
            <ItemRowRemovable
              key={item.id}
              backlogItemId={item.id}
              index={i + 1}
              catalogItemId={item.catalogItemId}
              title={item.title}
              mediaType={item.mediaType}
              verdict={item.verdict}
              obsessed={item.obsessed}
              sourceCrossMediaRecId={item.sourceCrossMediaRecId}
            />
          ))}

          {showReactionCoach && (
            <div className="bl-rise mx-5 mt-[26px]">
              <div className="h-px bg-line" />
              <div className="mt-4 flex gap-2.5 font-mono text-[9px] uppercase tracking-[0.16em]">
                <span className="flex-none text-text-2">Paso 3</span>
                <span className="leading-[1.7] text-text-3">
                  Abre el título y márcalo «me obsesiona», o «me gusta» en el
                  menú de opciones. Eso enciende las recomendaciones.
                </span>
              </div>
            </div>
          )}

          {/* A filled backlog had no add affordance of its own — the only path
              back to search was the dock. This row carries the pinned target,
              same as the empty state's CTA. */}
          <Link
            href={`/descubrir?buscar=1&to=${backlog.id}`}
            className="mx-5 mt-[18px] flex items-center gap-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-text-2 transition-colors hover:text-text"
          >
            <span aria-hidden className="text-[14px] leading-none text-accent">
              ＋
            </span>
            Agregar a este backlog
          </Link>
        </div>
      ) : (
        /* Estante en blanco (mock #p7) */
        <div
          className={`relative flex flex-col items-center px-[30px] pt-11 text-center ${content}`}
        >
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-[#33333C]">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="#4A4A54"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="mt-[22px] font-serif text-[26px] italic leading-[1.2]">
            Este backlog está en blanco.
          </p>
          <p className="mt-3 max-w-[30ch] text-sm leading-[1.55] text-text-2">
            Agrega una película, serie o álbum — su color llenará el aura del
            backlog.
          </p>
          {/* The CTA carries its own destination: ?buscar=1 opens the search
              panel directly (no editorial detour through Recomiéndame, which
              a user with nothing loved can't use yet) and ?to= pins THIS
              backlog as where the adds land. */}
          <Link
            href={`/descubrir?buscar=1&to=${backlog.id}`}
            className="mt-[26px] flex items-center justify-center gap-2 rounded-full bg-accent px-[22px] py-3.5 text-[15px] font-semibold text-bg"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Agregar algo
          </Link>
          <Link
            href="/para-ti"
            className="mt-3.5 text-sm text-text-2 transition-colors hover:text-text"
          >
            Explorar Para ti
          </Link>
        </div>
      )}
    </div>
  );
}
