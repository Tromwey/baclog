import { z } from "zod";
import { assertOwnsBacklog } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import {
  backlogNameSchema,
  backlogVibeSchema,
  deleteBacklog,
  getOwnCollection,
  setBacklogCover,
  setBacklogPinned,
  updateBacklog,
} from "@/modules/backlog/collections";
import { getBacklogItemsWithState } from "@/modules/backlog/queries";
import { visibilityFromWire } from "@/modules/backlog/visibility";
import { json, noContent, parseId, readJson } from "../../_lib/http";
import { VisibilitySchema } from "../../_lib/schemas";
import { toCollection, toCollectionDetail } from "../../_lib/wire";

/**
 * GET /api/v1/collections/{id} → { collection, titles: [Title], states }
 * (§4 Colecciones). Ownership via `assertOwnsBacklog` — someone else's, a
 * nonexistent or a malformed id is the same 404. `titles` are summaries in
 * the collection's order; `states` is keyed by titleId and comes off
 * `user_item` (state never lives on the membership row): `savedAt` is the
 * FIRST membership (`user_item.addedAt`).
 */
export const GET = withApi<{ id: string }>(async (_req, { params }) => {
  const { backlog } = await assertOwnsBacklog(parseId(params.id));
  const items = await getBacklogItemsWithState(backlog.id);
  return json(
    toCollectionDetail(
      backlog,
      items.map((it) => ({ ...it, savedAt: it.userItemAddedAt })),
    ),
  );
});

const PatchBodySchema = z.object({
  name: backlogNameSchema.optional(),
  /** `null` or `""` clears the vibe; absent leaves it alone. */
  vibe: backlogVibeSchema.nullable().optional(),
  visibility: VisibilitySchema.optional(),
  /** Fijar / Desfijar — one pinned collection per account. */
  pinned: z.boolean().optional(),
  /** A member's titleId = its chosen cover; `null` = automatic cover. */
  coverTitleId: z.string().min(1).max(64).nullable().optional(),
});

const NOT_A_MEMBER = "Ese título no está en esta colección.";

/**
 * PATCH /api/v1/collections/{id} { name?, vibe?, visibility?, pinned?,
 * coverTitleId? } → Collection (re-read). A field left out is left alone;
 * an empty body writes nothing (not even `updatedAt`) and still returns the
 * resource. Visibility lands as the F3.10.1 pair.
 *
 * `pinned: true` unpins whatever else the account had pinned in the same
 * transaction (`setBacklogPinned`). `coverTitleId` must be a member of THIS
 * collection (checked inside the UPDATE, `setBacklogCover`) — else 400
 * `fields.coverTitleId`. The cover goes FIRST because it is the only field
 * that can be refused after the body parsed: a refused cover writes nothing
 * else. Ownership is asserted before any of it (foreign/nonexistent = 404).
 */
export const PATCH = withApi<{ id: string }>(async (request, { user, params }) => {
  const { backlog } = await assertOwnsBacklog(parseId(params.id));
  const body = await readJson(request, PatchBodySchema);
  if (body.coverTitleId !== undefined) {
    const ok = await setBacklogCover(user.id, backlog.id, body.coverTitleId);
    if (!ok) {
      throw new ApiError("invalid", NOT_A_MEMBER, { fields: { coverTitleId: NOT_A_MEMBER } });
    }
  }
  if (body.pinned !== undefined) {
    if (!(await setBacklogPinned(user.id, backlog.id, body.pinned))) {
      throw new ApiError("not_found");
    }
  }
  const ok = await updateBacklog(user.id, backlog.id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.vibe !== undefined ? { vibe: body.vibe } : {}),
    ...(body.visibility !== undefined
      ? { visibility: visibilityFromWire(body.visibility) }
      : {}),
  });
  if (!ok) throw new ApiError("not_found");
  const row = await getOwnCollection(user.id, backlog.id);
  if (!row) throw new ApiError("not_found");
  return json(toCollection(row));
});

/**
 * DELETE /api/v1/collections/{id}[?purge=1] → 204. Memberships cascade.
 * Without the parameter the per-title state of the titles that lived only
 * here is KEPT (the default, same as the web's `deleteBacklogAction`). With
 * `?purge=1` those titles also lose their state, reaction and review
 * (`deleteBacklog({ purge: true })`); titles that are in another collection
 * are never touched. Any other value of `purge` is 400 `invalid` — a typo
 * must not silently pick one of the two. The choice and its confirmation
 * live in the app. Ownership is asserted before anything is read or written.
 */
export const DELETE = withApi<{ id: string }>(async (request, { user, params }) => {
  const { backlog } = await assertOwnsBacklog(parseId(params.id));
  const raw = new URL(request.url).searchParams.getAll("purge");
  if (raw.length > 1 || (raw.length === 1 && raw[0] !== "1")) {
    const message = "`purge` solo acepta 1.";
    throw new ApiError("invalid", undefined, { fields: { purge: message } });
  }
  await deleteBacklog(user.id, backlog.id, { purge: raw.length === 1 });
  return noContent();
});
