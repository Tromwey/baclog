import { ApiError, withApi } from "@/authz/api";
import { getCatalogItem } from "@/modules/catalog/cache";
import { getOthersReviewsPage } from "@/modules/reviews/queries";
import { json, parseId, readCursor } from "../../../_lib/http";
import type { Paginated, Review } from "../../../_lib/schemas";
import { toPublicReview } from "../../../_lib/wire";

/**
 * GET /api/v1/titles/{id}/reviews?cursor= → `{ items: [Review], nextCursor }`
 * (§4 Títulos) — the ficha's review list past the first page. The app takes
 * `reviews.nextCursor` from `GET /titles/{id}` and follows it here.
 *
 * Same module call the ficha makes (`getOthersReviewsPage`), so:
 *  - no cursor = the SAME first page `GET /titles/{id}` embeds (minus the
 *    pinned own review) with the same `nextCursor`;
 *  - the caller's OWN review is excluded from every page: it lives pinned in
 *    `GET /titles/{id}` (with `hidden`) and never repeats here;
 *  - public gate inside the query (`isPublic AND username IS NOT NULL AND
 *    hidden_at IS NULL`, reviews/queries.ts) — nothing new is exposed, and
 *    no item carries `hidden`.
 * A corrupt cursor (bad instant, year < 2000, or an id half that isn't a
 * UUID) is 400 `fields.cursor` (`readCursor`); a malformed or
 * unknown title id is the same 404 as on `GET /titles/{id}`.
 */
export const GET = withApi<{ id: string }>(async (req, { user, params }) => {
  const id = parseId(params.id);
  // `item_review.id` is a UUID (`crypto.randomUUID()`), so the id half must be one.
  const cursor = readCursor(req, { uuidId: true });

  const [item, page] = await Promise.all([
    getCatalogItem(id),
    getOthersReviewsPage(user.id, id, cursor),
  ]);
  if (!item) throw new ApiError("not_found");

  const body: Paginated<Review> = {
    items: page.reviews.map((r) => toPublicReview(r, item.id)),
    nextCursor: page.nextCursor,
  };
  return json(body);
});
