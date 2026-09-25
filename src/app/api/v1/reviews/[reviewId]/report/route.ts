import { withApi } from "@/authz/api";
import { reportReview } from "@/modules/reports/write";
import { noContent, readJson, uuidOrNull } from "../../../_lib/http";
import { ReviewReportBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/reviews/{reviewId}/report
 *   { reason: "unmarked_spoiler"|"spam"|"harassment"|"hate"|"illegal_content"|"off_topic"|"other" }
 *   → 204, ALWAYS (App Store 1.2 · the web's reportReviewAction, same module).
 *
 * `{reviewId}` is `Review.id`. A nonexistent review, your own, one you
 * already reported and a non-UUID id are all a 204 that inserts nothing — the
 * response never confirms the review exists or that anything happened. Only a
 * bad BODY is a 400 `invalid` + `fields` (validated first, so it can't
 * vary with the id). Rules in `modules/reports/write.ts`.
 */
export const POST = withApi<{ reviewId: string }>(async (request, { user, params }) => {
  const body = await readJson(request, ReviewReportBodySchema);
  const reviewId = uuidOrNull(params.reviewId);
  if (reviewId) await reportReview(user.id, reviewId, body);
  return noContent();
});
