import { z } from "zod";
import { assertOwnsUserItem } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import { publicMarkOf } from "@/modules/backlog/mark";
import { deleteOwnReview, getOwnReview, saveReview } from "@/modules/reviews/write";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";
import { json, noContent, parseId, readJson } from "../../../../_lib/http";
import { toOwnReview } from "../../../../_lib/wire";

/**
 * PUT    /api/v1/me/titles/{id}/review  { body, hasSpoiler } → Review
 * DELETE /api/v1/me/titles/{id}/review  → 204 (idempotent)
 * (§4 Títulos y estado propio). `{id}` is the catalog item; ownership via
 * `assertOwnsUserItem` — a title outside the library is the same 404 as a
 * nonexistent id. The rules live in `modules/reviews/write.ts` (the code the
 * web action runs): react first (409 `reaction_required`), no links (400),
 * ≤280 (400), albums never carry a spoiler, editing keeps `hiddenAt`.
 *
 * `authorHandle` is `users.username` as is — null (never "") while the
 * caller has no handle, via `toOwnReview` — never an id (nothing on the wire carries a user id). `mark` is
 * the caller's reaction at write time (`publicMarkOf`, so a `disliked`
 * review says so).
 */

const PutReviewBody = z.object({
  body: z.string(),
  hasSpoiler: z.boolean(),
});

const REACTION_REQUIRED =
  "Primero cuéntanos qué te pareció: marca la obra y luego escribe tu reseña.";
const NO_LINKS = "Las reseñas no llevan enlaces.";
const BAD_BODY = `Escribe entre 1 y ${REVIEW_MAX_LENGTH} caracteres.`;

export const PUT = withApi<{ id: string }>(async (request, { user, params }) => {
  const { item } = await assertOwnsUserItem(parseId(params.id));
  const input = await readJson(request, PutReviewBody);

  const result = await saveReview(user.id, item.catalogItemId, input);
  if ("error" in result) {
    switch (result.error) {
      case "not_found":
        throw new ApiError("not_found");
      case "locked":
        throw new ApiError("conflict", REACTION_REQUIRED, { reason: "reaction_required" });
      case "link":
        throw new ApiError("invalid", NO_LINKS, { fields: { body: NO_LINKS } });
      case "invalid":
        throw new ApiError("invalid", BAD_BODY, { fields: { body: BAD_BODY } });
    }
  }

  const own = await getOwnReview(user.id, item.catalogItemId);
  if (!own) throw new ApiError("internal"); // just upserted — a read-after-write miss is a bug

  const review = toOwnReview(
    {
      id: own.id,
      body: own.body,
      hasSpoiler: own.hasSpoiler,
      mark: publicMarkOf(item),
      createdAt: own.createdAt,
      updatedAt: own.updatedAt,
      hidden: own.hiddenAt !== null,
    },
    item.catalogItemId,
    user.username,
  );
  return json(review);
});

export const DELETE = withApi<{ id: string }>(async (_request, { user, params }) => {
  const { item } = await assertOwnsUserItem(parseId(params.id));
  await deleteOwnReview(user.id, item.catalogItemId);
  return noContent();
});
