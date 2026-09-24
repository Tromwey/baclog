import { assertUser } from "@/authz";
import { withApi } from "@/authz/api";
import { getUserLibrary } from "@/modules/backlog/library";
import { json } from "../../_lib/http";
import { toTitleState } from "../../_lib/wire";

/**
 * GET /api/v1/me/titles → { items: [{ titleId, state: TitleState }] }
 * (§4 Títulos): the bearer user's WHOLE library, one entry per `user_item`
 * (a title filed in two collections appears once, with its first `savedAt`),
 * newest first. `me/titles/{id}/**` (mark, review, delete) arrives with
 * phase 2.
 */
export const GET = withApi(async () => {
  const user = await assertUser();
  const rows = await getUserLibrary(user.id);
  return json({
    items: rows.map((row) => ({ titleId: row.catalogItemId, state: toTitleState(row) })),
  });
});
