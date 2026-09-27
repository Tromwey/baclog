"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertUser, NotFoundError } from "@/authz";
import { db } from "@/db";
import { backlogItems } from "@/db/schema";
import { createBacklog, reorderBacklogItems, setBacklogCover } from "@/modules/backlog/collections";
import { byManualOrder, fanOf } from "@/modules/backlog/fan";
import { ensureUserItemAndMembership } from "@/modules/backlog/membership";
import { getPublicBacklog } from "@/modules/backlog/public";

/**
 * Actions of the shared-collection page (/u/[username]/[backlogId]). Their
 * own "use server" module: the /u tree loads it without the rest of
 * backlog-actions.ts.
 */

/** A shared collection bigger than this is saved up to here (a copy, not a sync). */
const SAVE_SHARED_MAX = 300;

/**
 * "Guárdala en kura" (Colecciones formalizado · 4a): a signed-in visitor
 * keeps a copy of someone's shared collection — a NEW collection of their
 * own, private ("Solo yo") until they choose otherwise, with the same name,
 * line, titles, order and cover. A copy, not a follow: later changes on
 * either side don't travel.
 *
 * Reads the source ONLY through `getPublicBacklog` — the same gate as the
 * page that shows the button (owner public, collection public) — so this can
 * never copy a private collection. The owner saving their own gets their
 * collection back, untouched. Each title enters through
 * `ensureUserItemAndMembership` (the one way a title enters a library), so an
 * existing per-title state of the visitor is kept, never overwritten.
 */
export async function saveSharedCollectionAction(username: string, backlogId: string) {
  const user = await assertUser();
  const ids = z.tuple([z.string().min(1).max(64), z.string().min(1).max(64)]).safeParse([
    username,
    backlogId,
  ]);
  if (!ids.success) return { error: "invalid" as const };
  const source = await getPublicBacklog(ids.data[0], ids.data[1]);
  if (!source) throw new NotFoundError();
  if (source.ownerUsername === user.username) return { id: source.backlogId };

  const ordered = [...source.items].sort(byManualOrder).slice(0, SAVE_SHARED_MAX);
  const created = await createBacklog(user.id, {
    name: source.backlogName.slice(0, 60),
    vibe: source.vibe ? source.vibe.slice(0, 80) : null,
    visibility: "private",
  });

  // Small parallel batches: each title is a few round trips over HTTP.
  for (let i = 0; i < ordered.length; i += 8) {
    await Promise.all(
      ordered.slice(i, i + 8).map((it) =>
        ensureUserItemAndMembership({
          userId: user.id,
          backlogId: created.id,
          catalogItemId: it.catalogItemId,
          paletteHex: it.paletteHex ?? null,
        }),
      ),
    );
  }

  // The copy keeps the source's order and cover.
  const rows = await db
    .select({ id: backlogItems.id, catalogItemId: backlogItems.catalogItemId })
    .from(backlogItems)
    .where(and(eq(backlogItems.backlogId, created.id), eq(backlogItems.userId, user.id)));
  const idOf = new Map(rows.map((r) => [r.catalogItemId, r.id]));
  const order = ordered.flatMap((it) => idOf.get(it.catalogItemId) ?? []);
  if (order.length > 0) await reorderBacklogItems(user.id, created.id, order);
  const lead = fanOf(ordered, source.coverCatalogItemId)[0];
  if (lead && source.coverCatalogItemId === lead.catalogItemId) {
    await setBacklogCover(user.id, created.id, lead.catalogItemId);
  }

  revalidatePath("/backlogs", "layout");
  return { id: created.id };
}
