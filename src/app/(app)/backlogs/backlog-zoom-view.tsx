import { and, desc, eq, inArray } from "drizzle-orm";
import { assertOwnsBacklog } from "@/authz";
import { db } from "@/db";
import { backlogItems, catalogItems } from "@/db/schema";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { tintEnds } from "@/components/kura/tint";
import { visibilityOf } from "@/modules/backlog/visibility";
import { getRenderInstant } from "@/modules/catalog/release";
import { getBacklogItems, getBacklogNames } from "@/modules/backlog/queries";
import { firstRunCoach, getFirstRunCounts } from "@/modules/backlog/first-run";
import type { MediaType } from "@/modules/catalog/types";
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
 * Kura adds two owner-only reads for "Mover a" (O4a): the user's other
 * collections with their newest cover, and which collections each title here
 * already lives in (so a move never duplicates and its undo never removes a
 * membership that existed before). Both are scoped by the session user id
 * derived from the assert above — never by anything the client sent.
 */
export async function loadBacklogZoom(backlogId: string) {
  const itemsP = getBacklogItems(backlogId);
  itemsP.catch(() => {}); // no unhandled rejection if the assert throws first
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const items = await itemsP;
  const catalogIds = items.map((it) => it.catalogItemId);

  const [counts, now, names, thumbs, memberRows] = await Promise.all([
    getFirstRunCounts(user.id),
    getRenderInstant(),
    getBacklogNames(user.id),
    db
      .selectDistinctOn([backlogItems.backlogId], {
        backlogId: backlogItems.backlogId,
        posterUrl: catalogItems.posterUrl,
        paletteHex: catalogItems.paletteHex,
        mediaType: catalogItems.mediaType,
      })
      .from(backlogItems)
      .innerJoin(catalogItems, eq(backlogItems.catalogItemId, catalogItems.id))
      .where(eq(backlogItems.userId, user.id))
      .orderBy(backlogItems.backlogId, desc(backlogItems.addedAt)),
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
  ]);

  const thumbOf = new Map(thumbs.map((t) => [t.backlogId, t]));
  const others: OtherCollection[] = names
    .filter((n) => n.id !== backlog.id)
    .map((n) => {
      const t = thumbOf.get(n.id);
      return {
        id: n.id,
        name: n.name,
        posterUrl: t?.posterUrl ?? null,
        paletteHex: t?.paletteHex ?? null,
        mediaType: (t?.mediaType ?? "film") as MediaType,
      };
    });

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
    viewer: { username: user.username, profilePublic: user.isPublic },
  };
}

export type BacklogZoomData = Awaited<ReturnType<typeof loadBacklogZoom>>;

/**
 * Colección (flujos-v2 03, 2026-09-24): the tinted header (Volver · Opciones
 * at 64/24, the chosen cover at 240 centered, the name in Newsreader 24, the
 * format pills that filter), then the body grouped by format or as a shelf
 * (the frames' `adapt()` rule), or as a list. Every action lives in Opciones.
 * No dock (HideDock). Server-safe wrapper; the screen itself is client.
 *
 * Shared by the real /backlogs/[id] page and the intercepted overlay (`zoom`
 * adds the bl-zoom-content stagger; the overlay route owns the spring bloom on its
 * fixed shell).
 */
export function BacklogZoomView({
  data,
  zoom = false,
}: {
  data: BacklogZoomData;
  zoom?: boolean;
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

  const lead = list.find((it) => it.paletteHex?.length)?.paletteHex ?? [];

  return (
    <>
      {/* In-browser Safari tints the status-bar band from theme-color — the
          top of the tinted header, so the header doesn't cut off in black. */}
      <ThemeColorSync color={lead.length ? tintEnds(lead)[0] : undefined} exact />
      <HideDock />
      <CollectionScreen
        mode="owned"
        backlog={{
          id: backlog.id,
          name: backlog.name,
          vibe: backlog.vibe,
          visibility: visibilityOf(backlog),
        }}
        items={list}
        now={now}
        others={data.others}
        memberships={data.memberships}
        username={data.viewer.username}
        profilePublic={data.viewer.profilePublic}
        coach={data.coach}
        zoom={zoom}
      />
    </>
  );
}
