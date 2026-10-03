"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUser, NotFoundError } from "@/authz";
import { byManualOrder, fanOf } from "@/modules/backlog/fan";
import { saveCollectionCopy } from "@/modules/backlog/membership";
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
 * collection back, untouched. The write is `saveCollectionCopy`
 * (modules/backlog/membership.ts): one atomic statement, idempotent on a
 * deterministic id — a double tap opens the same copy, never a second one —
 * and an existing per-title state of the visitor is kept, never overwritten.
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
  // The copy keeps the source's order and (if the owner chose one) its cover.
  const lead = fanOf(ordered, source.coverCatalogItemId)[0];
  const name = source.backlogName.trim().slice(0, 60);
  const created = await saveCollectionCopy(user.id, {
    backlogId: source.backlogId,
    name: name.length > 0 ? name : "Colección",
    vibe: source.vibe ? source.vibe.trim().slice(0, 80) || null : null,
    catalogItemIds: ordered.map((it) => it.catalogItemId),
    coverCatalogItemId:
      lead && source.coverCatalogItemId === lead.catalogItemId ? lead.catalogItemId : null,
  });

  revalidatePath("/backlogs", "layout");
  return { id: created.id };
}
