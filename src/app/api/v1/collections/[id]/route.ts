import { z } from "zod";
import { assertOwnsBacklog } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import {
  backlogNameSchema,
  backlogVibeSchema,
  deleteBacklog,
  getOwnCollection,
  updateBacklog,
} from "@/modules/backlog/collections";
import { getBacklogItemsWithState } from "@/modules/backlog/queries";
import { visibilityFromWire } from "@/modules/backlog/visibility";
import { json, noContent, readJson } from "../../_lib/http";
import { VisibilitySchema, type TitleState } from "../../_lib/schemas";
import { toCollection, toTitleState, toTitleSummary } from "../../_lib/wire";

/**
 * GET /api/v1/collections/{id} → { collection, titles: [Title], states }
 * (§4 Colecciones). Ownership via `assertOwnsBacklog` — someone else's or a
 * nonexistent id is the same 404. `titles` are summaries in the collection's
 * order; `states` is keyed by titleId and comes off `user_item` (state never
 * lives on the membership row).
 */
export const GET = withApi<{ id: string }>(async (_req, { params }) => {
  const { backlog } = await assertOwnsBacklog(params.id);
  const items = await getBacklogItemsWithState(backlog.id);

  const states: Record<string, TitleState> = {};
  for (const it of items) {
    states[it.catalogItemId] = toTitleState({
      catalogItemId: it.catalogItemId,
      status: it.status,
      verdict: it.verdict,
      obsessed: it.obsessed,
      addedAt: it.userItemAddedAt,
      reviewId: it.reviewId,
    });
  }

  return json({
    collection: toCollection({
      ...backlog,
      memberships: items.map((it) => ({
        catalogItemId: it.catalogItemId,
        addedAt: it.addedAt,
        posterUrl: it.posterUrl,
      })),
    }),
    titles: items.map((it) =>
      toTitleSummary({
        id: it.catalogItemId,
        title: it.title,
        mediaType: it.mediaType,
        year: it.year,
        byline: it.byline,
        posterUrl: it.posterUrl,
        paletteHex: it.paletteHex,
      }),
    ),
    states,
  });
});

const PatchBodySchema = z.object({
  name: backlogNameSchema.optional(),
  /** `null` or `""` clears the vibe; absent leaves it alone. */
  vibe: backlogVibeSchema.nullable().optional(),
  visibility: VisibilitySchema.optional(),
});

/**
 * PATCH /api/v1/collections/{id} { name?, vibe?, visibility? } → Collection
 * (re-read). `renameBacklogAction` + `setBacklogVisibilityAction` in one
 * body; a field left out is left alone, an empty body is a no-op that still
 * returns the resource. Visibility lands as the F3.10.1 pair.
 */
export const PATCH = withApi<{ id: string }>(async (request, { user, params }) => {
  const { backlog } = await assertOwnsBacklog(params.id);
  const body = await readJson(request, PatchBodySchema);
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
 * DELETE /api/v1/collections/{id} → 204. Memberships cascade; the per-title
 * state of the titles that lived only here is NOT garbage-collected (same as
 * the web's `deleteBacklogAction`). The destructive confirmation lives in
 * the app.
 */
export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const { backlog } = await assertOwnsBacklog(params.id);
  await deleteBacklog(user.id, backlog.id);
  return noContent();
});
