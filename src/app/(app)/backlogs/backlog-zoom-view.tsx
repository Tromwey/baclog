import { assertOwnsBacklog } from "@/authz";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { tintEnds } from "@/components/kura/tint";
import { visibilityOf } from "@/modules/backlog/visibility";
import { getRenderInstant } from "@/modules/catalog/release";
import {
  getBacklogItemByCatalog,
  getBacklogItemsPage,
  getBacklogKindCounts,
  getBacklogNames,
  getMembershipsOf,
  getUserPalette,
  toCollectionItem,
} from "@/modules/backlog/queries";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import { getCollaboratorsForBacklogs } from "@/modules/backlog/collaborators";
import { fanHexes, fanOf } from "@/modules/backlog/fan";
import { getCollectionFans } from "@/modules/backlog/shelves";
import { COLLECTION_PAGE_SIZE, encodeCollectionCursor } from "@/modules/backlog/collection-cursor";
import { CollectionScreen, type OtherCollection } from "./[backlogId]/collection-screen";

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
 *
 * Colecciones largas (ronda 8): only the FIRST page of titles is read here
 * (60, in the manual order). The rest comes as the page scrolls
 * (`getCollectionPageAction`), so everything that speaks for the whole
 * collection travels apart: the counts per format (an aggregate) and the
 * chosen cover when it sits past this page (the fan leads with it).
 */
export async function loadBacklogZoom(backlogId: string) {
  const pageP = getBacklogItemsPage(backlogId, { sort: "manual", limit: COLLECTION_PAGE_SIZE });
  const kindsP = getBacklogKindCounts(backlogId);
  // no unhandled rejection if the assert throws first
  pageP.catch(() => {});
  kindsP.catch(() => {});
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const [page, kinds] = await Promise.all([pageP, kindsP]);
  const coverId = backlog.coverCatalogItemId;
  const coverAhead = coverId !== null && !page.rows.some((it) => it.catalogItemId === coverId);
  const catalogIds = page.rows.map((it) => it.catalogItemId);
  if (coverAhead) catalogIds.push(coverId);

  const [counts, now, names, fans, memberships, credits, palette, coverRow] = await Promise.all([
    getFirstRunCounts(user.id),
    getRenderInstant(),
    getBacklogNames(user.id),
    getCollectionFans(user.id),
    // Scoped by the session's user id inside the query.
    getMembershipsOf(user.id, catalogIds),
    // Scoped: `backlog.id` came out of assertOwnsBacklog above.
    getCollaboratorsForBacklogs(user.id, [backlog.id]),
    getUserPalette(user.id),
    coverAhead ? getBacklogItemByCatalog(backlog.id, coverId) : null,
  ]);

  const others: OtherCollection[] = names
    .filter((n) => n.id !== backlog.id)
    .map((n) => ({
      id: n.id,
      name: n.name,
      fan: fans[n.id]?.covers ?? [],
      count: fans[n.id]?.count ?? 0,
    }));

  return {
    backlog,
    items: page.rows.map(toCollectionItem),
    paging: {
      counts: kinds,
      nextCursor: page.next ? encodeCollectionCursor(page.next, backlog.id) : null,
      cover: coverRow ? toCollectionItem(coverRow) : null,
    },
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
 * order (or as a list). Every action lives in Opciones. The dock stays
 * (founder, 2026-09-27: "la barra no se debería esconder al entrar a los
 * ítems ni a las colecciones").
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
  const { backlog, items: list, paging, now } = data;

  // The manual order's first titles + the chosen cover wherever it lives.
  const head = paging.cover ? [paging.cover, ...list] : list;
  const lead = fanHexes(fanOf(head, backlog.coverCatalogItemId), head);

  return (
    <>
      {/* In-browser Safari tints the status-bar band from theme-color — the
          top of the tinted header, so the header doesn't cut off in black. */}
      <ThemeColorSync color={lead.length ? tintEnds(lead)[0] : undefined} exact />
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
        paging={paging}
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
