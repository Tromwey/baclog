import { withApi } from "@/authz/api";
import { parseHandleOrNull } from "@/modules/account/username";
import { reportProfile } from "@/modules/reports/write";
import { noContent, readJson } from "../../../_lib/http";
import { ProfileReportBodySchema } from "../../../_lib/schemas";

/**
 * POST /api/v1/people/{handle}/report
 *   { reason: "spam"|"impersonation"|"harassment"|"illegal_content"|"other", details?: string ≤ 500 }
 *   → 204, ALWAYS (App Store 1.2 · same posture as the web's submitReportAction).
 *
 * The response never says whether the handle exists: nonexistent, private,
 * malformed and your own handle are all a 204 that inserts nothing. The ONLY
 * non-204 is a bad BODY (400 `invalid` + `fields`) — that is the client's
 * bug and says nothing about the handle, which is why the body is validated
 * before the handle is even looked at. The rules live in
 * `modules/reports/write.ts` (the web action runs the same function). Not
 * gated on blocks: you can report someone you blocked or who blocked you.
 */
export const POST = withApi<{ handle: string }>(async (request, { user, params }) => {
  const body = await readJson(request, ProfileReportBodySchema);
  const handle = parseHandleOrNull(typeof params.handle === "string" ? params.handle : null);
  if (handle) await reportProfile(user.id, handle, body);
  return noContent();
});
