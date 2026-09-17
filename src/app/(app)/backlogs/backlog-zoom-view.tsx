import Link from "next/link";
import { assertOwnsBacklog } from "@/authz";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { UpcomingShelf, type UpcomingItem } from "@/components/upcoming-shelf";
import { visibilityOf } from "@/modules/backlog/visibility";
import { SHARE_PATH } from "@/components/glyph-paths";
import {
  CoachNote,
  PaletteGlow,
  StateGlyph,
  StrokeIcon,
  glassChipClass,
  mixHexes,
} from "@/components/ui";
import { plural } from "@/lib/plural";
import { getRenderInstant, isUpcoming } from "@/modules/catalog/release";
import { getBacklogItems } from "@/modules/backlog/queries";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import { HideDock } from "./hide-dock";
import { ZoomBackButton } from "./zoom-back-button";
import { BacklogGrid, type GridItem } from "./[backlogId]/backlog-grid";
import {
  BacklogVisibilityProvider,
  DeleteBacklogRow,
  EditBacklogTrigger,
  VisibilityPill,
  VisibilityRow,
} from "./[backlogId]/backlog-sheets";

/**
 * Shared data loader for the two detail twins ([backlogId]/page.tsx and the
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
  // First-run moment 2 (first-run.ts): library-wide counts. Fetched AFTER the
  // assert (it's a read for the owner only) but before render, so the note
  // never flashes in.
  const counts = await getFirstRunCounts(user.id);
  return {
    backlog,
    items,
    coach: firstRunCoach(counts).grid,
    // F3.8 — read the clock HERE (the loader is async; the view below is not)
    // so the strip and every wait pill share one instant.
    now: await getRenderInstant(),
  };
}

/**
 * Backlog detail (Revamp UI screen 03, 2026-09-03): a page-wide palette glow
 * hanging off the top, the header row (back · visibility pill · share), the
 * title block (mono count, serif 54 name, vibe + "editar"), this backlog's
 * "No puede esperar", the tabbed cover grid, and the settings rows. No dock —
 * the floating "Agregar título" takes its place (HideDock + BacklogGrid).
 *
 * Server-safe; shared by the real /backlogs/[id] page (plain, template.tsx
 * animates it) and the intercepted overlay (`zoom` adds the bl-zoom-content
 * stagger; the overlay route owns bl-zoom-in on its fixed shell).
 */
export function BacklogZoomView({
  backlog,
  items,
  coach,
  now,
  zoom = false,
}: {
  backlog: {
    id: string;
    name: string;
    vibe: string | null;
    isPublic: boolean;
    showOnProfile: boolean;
  };
  items: BacklogItemWithCatalog[];
  /** First-run moment 2: nothing completed yet → explain the glyphs. */
  coach: boolean;
  /** The render instant from loadBacklogZoom — every wait on this screen is
   *  measured from it. */
  now: number;
  zoom?: boolean;
}) {
  const hasItems = items.length > 0;
  const content = zoom ? "bl-zoom-content" : "";
  const glow = mixHexes(items.map((it) => it.paletteHex ?? []));

  const upcoming: UpcomingItem[] = items
    .filter((it) => isUpcoming(it.releaseDate, now))
    .sort((a, b) => a.releaseDate!.getTime() - b.releaseDate!.getTime())
    .map((it) => ({
      catalogItemId: it.catalogItemId,
      title: it.title,
      mediaType: it.mediaType,
      posterUrl: it.posterUrl,
      paletteHex: it.paletteHex,
      releaseDate: it.releaseDate!.toISOString(),
    }));

  const gridItems: GridItem[] = items.map((it) => ({
    backlogItemId: it.id,
    catalogItemId: it.catalogItemId,
    title: it.title,
    mediaType: it.mediaType,
    year: it.year,
    posterUrl: it.posterUrl,
    paletteHex: it.paletteHex,
    status: it.status,
    verdict: it.verdict,
    obsessed: it.obsessed,
    releaseDate: it.releaseDate ? it.releaseDate.toISOString() : null,
  }));

  // The glyph legend only makes sense next to covers that can carry glyphs.
  const showGlyphCoach = coach && hasItems;

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-[160px] text-text">
      {/* In-browser Safari tints the status-bar band from theme-color — sync
          it to the glow's dominant hue so the hero doesn't cut off in black. */}
      <ThemeColorSync color={glow[0]} />
      <HideDock />

      {/* Page-wide light (mock: inset -60px -40px auto, 420px, blur 80, .5). */}
      <PaletteGlow
        hexes={glow}
        angle={110}
        opacity={0.5}
        blur={80}
        className={`-inset-x-10 -top-[60px] h-[420px] ${zoom ? "bl-zoom-aura" : ""}`}
      />

      <BacklogVisibilityProvider backlogId={backlog.id} initial={visibilityOf(backlog)}>
        <header
          className={`relative flex items-center justify-between px-5 pt-[calc(12px+env(safe-area-inset-top))] ${content}`}
        >
          <ZoomBackButton />
          <div className="flex items-center gap-2">
            <VisibilityPill />
            {hasItems && (
              <Link
                href={`/backlogs/${backlog.id}/card`}
                aria-label="Compartir"
                className={glassChipClass}
              >
                <StrokeIcon d={SHARE_PATH} size={16} strokeWidth={2.2} />
              </Link>
            )}
          </div>
        </header>

        <div className={`relative flex flex-col gap-2 px-6 pt-[26px] ${content}`}>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
            Backlog · {items.length} {plural(items.length, "título", "títulos")}
          </span>
          <h1 className="font-serif text-[54px] font-normal italic leading-[0.95] tracking-[-0.01em]">
            {backlog.name}
          </h1>
          <p className="mt-0.5 text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]">
            {backlog.vibe && <>{backlog.vibe} </>}
            <EditBacklogTrigger
              backlogId={backlog.id}
              name={backlog.name}
              vibe={backlog.vibe}
            />
          </p>
        </div>

        <div className={`relative pt-[26px] ${content}`}>
          {/* F3.8 — what hasn't come out yet, nearest first. The grid below
              repeats the wait as the cover's pill (mock), not as a row. */}
          <UpcomingShelf items={upcoming} initialNow={now} inset="px-6" />
        </div>

        <BacklogGrid
          backlogId={backlog.id}
          items={gridItems}
          now={now}
          className={`relative ${content}`}
        />

        {/* First-run moment 2 (first-run.ts): what the glyphs on the covers
            mean, said once, until the first completion. */}
        {showGlyphCoach && (
          <CoachNote className="mx-6 mt-[26px]">
            <span className="flex flex-wrap gap-x-3.5 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <StateGlyph kind="obsessed" size={10} /> te obsesiona
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StateGlyph kind="liked" size={11} /> te gustó
              </span>
              <span className="inline-flex items-center gap-1.5">
                <StateGlyph kind="done" size={11} /> completo
              </span>
            </span>
            Abre una portada para marcarla · «Agregar título» abajo suma más.
          </CoachNote>
        )}

        <div className={`relative flex flex-col gap-2 px-5 pt-[34px] ${content}`}>
          <VisibilityRow />
          <DeleteBacklogRow backlogId={backlog.id} />
        </div>
      </BacklogVisibilityProvider>
    </div>
  );
}
