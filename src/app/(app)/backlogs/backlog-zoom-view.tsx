import Link from "next/link";
import { assertOwnsBacklog } from "@/authz";
import { BacklogHero } from "@/components/backlog-hero";
import { ItemRowRemovable } from "@/components/item-row-removable";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { getBacklogItems } from "@/modules/backlog/queries";
import type { BacklogItemWithCatalog } from "@/modules/backlog/queries";
import { dominantHexes } from "@/modules/backlog/palette";
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
  const { backlog } = await assertOwnsBacklog(backlogId);
  const items = await itemsP;
  return { backlog, items, paletteHex: dominantHexes(items, 6) };
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
  zoom = false,
}: {
  backlog: { id: string; name: string; vibe: string | null; createdAt: Date };
  items: BacklogItemWithCatalog[];
  /** The backlog's ADN (dominant hexes). Ignored while the backlog is empty. */
  paletteHex: string[];
  zoom?: boolean;
}) {
  const hasItems = items.length > 0;
  const content = zoom ? "bl-zoom-content" : "";

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
            <BacklogMenu
              backlogId={backlog.id}
              currentName={backlog.name}
              hasItems={hasItems}
            />
          </>
        }
      />

      {hasItems ? (
        <div className={`relative mt-[18px] ${content}`}>
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
          <Link
            href="/descubrir"
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
