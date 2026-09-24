import { withApi } from "@/authz/api";
import { json, readCursor } from "@/app/api/v1/_lib/http";
import { buildPeoplePage } from "@/app/api/v1/people/_lib/people-page";

/** GET /api/v1/me/following?cursor= → { items: [Person], nextCursor, privateCount }.
 *  A followed account that went private stays listed with `isPrivate: true`
 *  (the viewer's own edge; see people-page.ts). Corrupt cursor → 400. */
export const GET = withApi(async (req, { user }) => {
  const cursor = readCursor(req);
  return json(await buildPeoplePage(user.id, "following", cursor));
});
