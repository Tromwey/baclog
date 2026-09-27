import { and, eq, inArray } from "drizzle-orm";
import { assertOwnsBacklog } from "@/authz";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { tintEnds } from "@/components/kura/tint";
import { visibilityOf } from "@/modules/backlog/visibility";
import { getRenderInstant } from "@/modules/catalog/release";
import { getBacklogItems, getBacklogNames, getUserPalette } from "@/modules/backlog/queries";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import { getCollaboratorsForBacklogs } from "@/modules/backlog/collaborators";
import { fanHexes, fanOf } from "@/modules/backlog/fan";
import { getCollectionFans } from "@/modules/backlog/shelves";
import { HideDock } from "./hide-dock";
import {
  CollectionScreen,
  type CollectionItem,
  type OtherCollection,
} from "./[backlogId]/collection-screen";

/**
 * Shared data loader for the two detail twins ([backlogId]/page.tsx and the
 * intercepted @modal/(.)[backlogId]/page.tsx). Ownership check and item fetch
 * run CONCURRENTLY — nothing renders unless the assert resolves, so the authz
 * model is unchanged; the items are just already in flight when it does.
 * Throws assertOwnsBacklog's NotFoundError/UnauthorizedError — each twin maps
 * them to its own recovery (404 vs. redirect back to the list).
 *
 * Kura adds owner-only reads for "Mover a" (O4a): the user's other
 * collections with their fan (7a), and which collections each title here
 * already lives in (so a move never duplicates and its undo never removes a
 * membership that existed before); and for the header (Colecciones
 * formalizado · 2a): the credits and the owner's palette for their seal. All
 * scoped by the session user id derived from the assert above — never by
 * anything the client sent.
 */
export async function loadBacklogZoom(backlogId: string) {
  const itemsP = getBacklogItems(backlogId);
  itemsP.catch(() => {}); // no unhandled rejection if the assert throws first
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const items = await itemsP;
  const catalogIds = items.map((it) => it.catalogItemId);

  const [counts, now, names, fans, memberRows, credits, palette] = await Promise.all([
    getFirstRunCounts(user.id),
    getRenderInstant(),
    getBacklogNames(user.id),
    getCollectionFans(user.id),
    catalogIds.length
      ? db
          .select({
            backlogId: backlogItems.backlogId,
            catalogItemId: backlogItems.catalogItemId,
          })
          .from(backlogItems)
          .where(
            and(
              eq(backlogItems.userId, user.id),
              inArray(backlogItems.catalogItemId, catalogIds),
            ),
          )
      : Promise.resolve([] as { backlogId: string; catalogItemId: string }[]),
    // Scoped: `backlog.id` came out of assertOwnsBacklog above.
    getCollaboratorsForBacklogs([backlog.id]),
    getUserPalette(user.id),
  ]);

  const others: OtherCollection[] = names
    .filter((n) => n.id !== backlog.id)
    .map((n) => ({
      id: n.id,
      name: n.name,
      fan: fans[n.id]?.covers ?? [],
      count: fans[n.id]?.count ?? 0,
    }));

  const memberships: Record<string, string[]> = {};
  for (const r of memberRows) {
    (memberships[r.catalogItemId] ??= []).push(r.backlogId);
  }

  return {
    backlog,
    items,
    coach: firstRunCoach(counts).grid,
    now,
    others,
    memberships,
    collaborators: credits.get(backlog.id) ?? [],
    owner: { name: user.name ?? user.username ?? "", image: user.image, hexes: palette },
    viewer: { username: user.username, profilePublic: user.isPublic },
  };
}

export type BacklogZoomData = Awaited<ReturnType<typeof loadBacklogZoom>>;

/**
 * Colección (Colecciones formalizado · 2a, 2026-09-27): the page in the feed
 * gradient of its fan, the fan at 225 as the header, the name, the line, the
 * credits and the format pills, then the titles in columns in the manual
 * order (or as a list). Every action lives in Opciones. No dock (HideDock).
 * Server-safe wrapper; the screen itself is client.
 *
 * Shared by the real /backlogs/[id] page and the profile's intercepted
 * overlay (`overlay`: the shell — `collection-overlay.tsx` — drives the
 * staged entrance through CSS variables, and the overlay covers the dock
 * instead of hiding it, so it is there under the overlay as it closes).
 */
export function BacklogZoomView({
  data,
  overlay = false,
}: {
  data: BacklogZoomData;
  overlay?: boolean;
}) {
  const { backlog, items, now } = data;

  const list: CollectionItem[] = items.map((it) => ({
    backlogItemId: it.id,
    catalogItemId: it.catalogItemId,
    title: it.title,
    byline: it.byline,
    mediaType: it.mediaType,
    year: it.year,
    posterUrl: it.posterUrl,
    paletteHex: it.paletteHex ?? null,
    status: it.status,
    verdict: it.verdict,
    obsessed: it.obsessed,
    releaseDate: it.releaseDate ? it.releaseDate.toISOString() : null,
    addedAt: it.addedAt.toISOString(),
  }));

  const lead = fanHexes(fanOf(list, backlog.coverCatalogItemId), list);

  return (
    <>
      {/* In-browser Safari tints the status-bar band from theme-color — the
          top of the tinted header, so the header doesn't cut off in black. */}
      <ThemeColorSync color={lead.length ? tintEnds(lead)[0] : undefined} exact />
      {!overlay && <HideDock />}
      <CollectionScreen
        mode="owned"
        backlog={{
          id: backlog.id,
          name: backlog.name,
          vibe: backlog.vibe,
          visibility: visibilityOf(backlog),
          pinned: backlog.pinnedAt !== null,
          coverCatalogItemId: backlog.coverCatalogItemId,
        }}
        items={list}
        now={now}
        others={data.others}
        memberships={data.memberships}
        owner={data.owner}
        collaborators={data.collaborators}
        username={data.viewer.username}
        profilePublic={data.viewer.profilePublic}
        coach={data.coach}
        overlay={overlay}
      />
    </>
  );
}
