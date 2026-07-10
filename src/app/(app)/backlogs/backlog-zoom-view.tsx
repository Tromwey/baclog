import Link from "next/link";
import { assertOwnsBacklog } from "@/authz";
import { AuraField, EMPTY_SHELF_AURA } from "@/components/ui";
import { ItemRowRemovable } from "@/components/item-row-removable";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { plural } from "@/lib/plural";
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
      {/* Hero light. Sin aura hasta el primer ítem (HANDOFF §5) — AuraField
          would fall back to lima on empty colors, so it's not rendered at all;
          an empty shelf gets the mock's faint neutral glow instead (#p7). */}
      <div
        className={`absolute inset-x-0 top-0 overflow-hidden ${hasItems ? "h-[330px]" : "h-[300px]"}`}
      >
        {hasItems ? (
          <div className={`absolute inset-0 ${zoom ? "bl-zoom-aura" : ""}`}>
            <AuraField
              variant="ambient"
              colors={paletteHex}
              seed={shelfSeed(backlog.id)}
            />
          </div>
        ) : (
          <AuraField layers={[EMPTY_SHELF_AURA]} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: hasItems
              ? "linear-gradient(180deg, rgba(11,11,13,0.15) 0%, rgba(11,11,13,0.1) 45%, #0B0B0D 96%)"
              : "linear-gradient(180deg, rgba(11,11,13,0.18) 0%, rgba(11,11,13,0.12) 45%, #0B0B0D 96%)",
          }}
        />
      </div>

      {/* top bar */}
      <div
        className={`relative flex items-center justify-between px-4 pt-[calc(24px+env(safe-area-inset-top))] ${content}`}
      >
        <ZoomBackButton />
        <BacklogMenu
          backlogId={backlog.id}
          currentName={backlog.name}
          hasItems={hasItems}
        />
      </div>

      {/* hero text */}
      <div className={`relative px-5 pt-[22px] ${content}`}>
        <h1
          className={`font-display font-extrabold leading-none tracking-[-0.025em] [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] ${hasItems ? "mt-[5px] text-[40px]" : "text-[38px]"}`}
        >
          {backlog.name}
        </h1>
        {backlog.vibe && (
          <p className="mt-2 max-w-[22ch] font-serif text-lg italic leading-[1.15] [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]">
            {backlog.vibe}
          </p>
        )}
        <p
          className={`font-mono text-[10px] uppercase tracking-[0.1em] text-text-2 ${hasItems ? "mt-2" : "mt-2.5"}`}
        >
          {items.length} {plural(items.length, "ítem", "ítems")}
          {hasItems
            ? ` · ${backlog.createdAt.getFullYear()}`
            : " · aún sin aura"}
        </p>
      </div>

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
