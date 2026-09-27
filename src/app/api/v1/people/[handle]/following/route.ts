import { withApi } from "@/authz/api";
import { json, parseHandle, readCursor } from "@/app/api/v1/_lib/http";
import { buildOthersPeoplePage } from "../../_lib/follow-lists";

/**
 * GET /api/v1/people/{handle}/following?cursor= → { items: [Person], anonymousCount,
 * nextCursor } (2026-09-27). 404 = private / nonexistent / malformed handle
 * or a block either way (one identical body) · 403 `forbidden` + reason
 * `lists_private` + `visibility` = the owner's setting doesn't let the
 * caller in · 400 `fields.cursor` = forged cursor. Gates and why:
 * people/_lib/follow-lists.ts.
 */
export const GET = withApi<{ handle: string }>(async (req, { user, params }) => {
  const handle = parseHandle(params.handle);
  const cursor = readCursor(req);
  return json(await buildOthersPeoplePage(user.id, handle, "following", cursor));
});
