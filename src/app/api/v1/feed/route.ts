import { withApi } from "@/authz/api";
import { json, readPage } from "@/app/api/v1/_lib/http";
import { getFeedEventsPage } from "@/modules/social/queries";
import { toWireFeedEvent } from "./_lib/serialize";

/**
 * GET /api/v1/feed?cursor= → { items: [FeedEvent], nextCursor }. One keyset
 * chunk of EVENTS (FEED_EVENT_CHUNK; `limit` is ignored — the chunk is the
 * unit the four branches over-fetch by) — the app groups bursts itself. A
 * cursor that doesn't decode serves page 1. Nobody followed → empty page.
 */
export const GET = withApi(async (req, { user }) => {
  const { cursor } = readPage(req);
  const page = await getFeedEventsPage(user.id, { cursor });
  return json({
    items: page.events.map(toWireFeedEvent),
    nextCursor: page.nextCursor,
  });
});
