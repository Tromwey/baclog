import { withApi } from "@/authz/api";
import { json, readCursor } from "@/app/api/v1/_lib/http";
import { getFeedEventsPage } from "@/modules/social/queries";
import { releaseDatesFor } from "../_lib/catalog";
import { toWireFeedEvent } from "./_lib/serialize";

/**
 * GET /api/v1/feed?cursor= → { items: [FeedEvent], nextCursor }. One keyset
 * chunk of EVENTS (FEED_EVENT_CHUNK — the unit the four branches over-fetch
 * by; there is no `limit`) — the app groups bursts itself. A cursor that
 * doesn't decode is a 400 (`readCursor`). Nobody followed → empty page.
 */
export const GET = withApi(async (req, { user }) => {
  const cursor = readCursor(req);
  const page = await getFeedEventsPage(user.id, { cursor });
  // The event's own `releaseDate` is gated ("no puede esperar" only); the
  // title summary needs the catalog's, ungated — one slim lookup per page.
  const releaseDateOf = await releaseDatesFor(page.events.map((e) => e.catalogItemId));
  return json({
    items: page.events.map((e) => toWireFeedEvent(e, releaseDateOf(e.catalogItemId))),
    nextCursor: page.nextCursor,
  });
});
