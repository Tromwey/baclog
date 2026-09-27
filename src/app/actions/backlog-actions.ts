"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertOwnsBacklog, assertUser, NotFoundError } from "@/authz";
import {
  backlogNameSchema,
  backlogVibeSchema,
  createBacklog,
  deleteBacklog,
  reorderBacklogItems,
  reorderSchema,
  setBacklogCover,
  setBacklogPinned,
  updateBacklog,
} from "@/modules/backlog/collections";
import type { BacklogVisibility } from "@/modules/backlog/visibility";

/**
 * Web wrappers over `modules/backlog/collections.ts` (the one write path the
 * API v1 handlers share): assert* → module → revalidate/redirect. Same public
 * signatures and return shapes as before the extraction.
 */

const nameSchema = backlogNameSchema;
const vibeSchema = backlogVibeSchema.optional();

export async function createBacklogAction(input: {
  name: string;
  vibe?: string;
}) {
  const user = await assertUser();
  const name = nameSchema.safeParse(input.name);
  const vibe = vibeSchema.safeParse(input.vibe);
  if (!name.success || !vibe.success) return { error: "invalid" as const };

  const created = await createBacklog(user.id, {
    name: name.data,
    vibe: vibe.data || null,
  });
  revalidatePath("/backlogs");
  return { id: created.id };
}

/**
 * Name + vibe (Revamp UI 2026-09-03: the detail's "editar" sheet edits both).
 * `vibe` is optional so the name-only callers keep working: `undefined` leaves
 * the vibe untouched, an empty string clears it.
 */
export async function renameBacklogAction(
  backlogId: string,
  name: string,
  vibe?: string,
) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const parsed = nameSchema.safeParse(name);
  const parsedVibe = vibeSchema.safeParse(vibe);
  if (!parsed.success || !parsedVibe.success) return { error: "invalid" as const };
  const ok = await updateBacklog(user.id, backlog.id, {
    name: parsed.data,
    ...(parsedVibe.data !== undefined ? { vibe: parsedVibe.data } : {}),
  });
  // Deleted between the assert and the write: say so, never a silent "ok".
  if (!ok) throw new NotFoundError();
  revalidatePath(`/backlogs/${backlog.id}`);
  revalidatePath("/backlogs");
  return { ok: true as const };
}

/**
 * F3.10.1 — Privado / Público / En tu perfil, set from the profile's edit
 * sheet. One action for the whole triad so the two columns can never be
 * written inconsistently (featured always implies public — the pair lives in
 * `VISIBILITY`, modules/backlog/visibility.ts). Revalidates the public tree
 * too: making a backlog private must 404 its /u URL immediately.
 */
export async function setBacklogVisibilityAction(
  backlogId: string,
  visibility: BacklogVisibility,
) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const parsed = z.enum(["private", "public", "featured"]).safeParse(visibility);
  if (!parsed.success) return { error: "invalid" as const };

  const ok = await updateBacklog(user.id, backlog.id, { visibility: parsed.data });
  if (!ok) throw new NotFoundError();

  revalidatePath("/perfil");
  revalidatePath("/feed");
  // The taller's shelf list shows the lock on private backlogs.
  revalidatePath("/backlogs");
  if (user.username) revalidatePath(`/u/${user.username}`, "layout");
  return { ok: true as const };
}

export async function deleteBacklogAction(backlogId: string) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  await deleteBacklog(user.id, backlog.id);
  revalidatePath("/backlogs");
  redirect("/backlogs");
}

/* ------------------------------------------- Colecciones formalizado */

/** Everything that draws a collection's fan, order or pin. */
function revalidateCollection(backlogId: string, username: string | null) {
  revalidatePath("/backlogs", "layout");
  revalidatePath(`/backlogs/${backlogId}`);
  revalidatePath("/perfil");
  if (username) revalidatePath(`/u/${username}`, "layout");
}

/** Fijar / Desfijar — one pinned collection per account (see setBacklogPinned). */
export async function setBacklogPinnedAction(backlogId: string, pinned: boolean) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  if (typeof pinned !== "boolean") return { error: "invalid" as const };
  const ok = await setBacklogPinned(user.id, backlog.id, pinned);
  if (!ok) throw new NotFoundError();
  revalidateCollection(backlog.id, user.username);
  return { ok: true as const };
}

/**
 * Usar como portada (`catalogItemId`) / Portada automática (`null`). The
 * module refuses a title that isn't a member of this collection.
 */
export async function setBacklogCoverAction(backlogId: string, catalogItemId: string | null) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const parsed = z.string().min(1).max(64).nullable().safeParse(catalogItemId);
  if (!parsed.success) return { error: "invalid" as const };
  const ok = await setBacklogCover(user.id, backlog.id, parsed.data);
  if (!ok) return { error: "not_member" as const };
  revalidateCollection(backlog.id, user.username);
  return { ok: true as const };
}

/** Reordenar — the membership ids first to last (see reorderBacklogItems). */
export async function reorderBacklogItemsAction(backlogId: string, orderedIds: string[]) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: "invalid" as const };
  const ok = await reorderBacklogItems(user.id, backlog.id, parsed.data);
  if (!ok) throw new NotFoundError();
  revalidateCollection(backlog.id, user.username);
  return { ok: true as const };
}
