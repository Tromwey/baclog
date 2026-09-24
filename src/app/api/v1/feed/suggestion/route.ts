import { withApi } from "@/authz/api";
import { json } from "@/app/api/v1/_lib/http";
import { getFeedSuggestion } from "@/modules/social/queries";
import { toWireSuggestion } from "../_lib/serialize";

/**
 * GET /api/v1/feed/suggestion → { event: FeedEvent(kind "suggest") | null }.
 * Null when the viewer follows nobody (the empty states own that) or nobody
 * public qualifies.
 */
export const GET = withApi(async (_req, { user }) => {
  const s = await getFeedSuggestion(user.id);
  return json({ event: s ? toWireSuggestion(s, new Date()) : null });
});
