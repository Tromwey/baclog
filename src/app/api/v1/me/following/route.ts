import { withApi } from "@/authz/api";
import { json, readPage } from "@/app/api/v1/_lib/http";
import { buildPeoplePage } from "@/app/api/v1/people/_lib/people-page";

/** GET /api/v1/me/following?cursor= → { items: [Person], nextCursor, privateCount }. */
export const GET = withApi(async (req, { user }) => {
  const { cursor } = readPage(req);
  return json(await buildPeoplePage(user.id, "following", cursor));
});
