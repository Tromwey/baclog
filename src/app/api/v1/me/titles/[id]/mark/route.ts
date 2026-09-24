import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { getOwnTitleState, setMark } from "@/modules/backlog/state";
import { json, parseId, readJson } from "../../../../_lib/http";
import { MarkSchema } from "../../../../_lib/schemas";
import { toTitleState } from "../../../../_lib/wire";

const BodySchema = z.object({
  mark: MarkSchema.nullable(),
  /** "La vi en preestreno" — lets a mark through on an unreleased title. */
  preview: z.boolean().optional(),
});

/**
 * PUT /api/v1/me/titles/{id}/mark { mark, preview? } → TitleState (re-read).
 * Kura semantics = `completeItemAction` collapsed into one write
 * (`modules/backlog/state.ts`): any mark completes; `obsessed` leaves the
 * verdict alone; `null` returns the title to the radar. Idempotent.
 *
 * Mark without saving (phase 4b): a non-null mark on a catalog title that
 * isn't in the caller's library CREATES its per-title state (a `user_item`
 * with no collection) and answers 200 like any other mark — the app offers
 * "guardar en" next. 404 when the catalog doesn't know the id (a malformed
 * id is the same 404) and for `mark: null` on a title that isn't in the
 * library (clearing nothing creates nothing). 409 `not_released` when
 * `releaseDate > now` and the app didn't say `preview` — checked BEFORE
 * anything is created.
 */
export const PUT = withApi<{ id: string }>(async (request, { user, params }) => {
  const id = parseId(params.id);
  const body = await readJson(request, BodySchema);
  const res = await setMark(user.id, id, body.mark, { preview: body.preview });
  if ("error" in res) {
    if (res.error === "not_released") {
      throw new ApiError(
        "conflict",
        "Todavía no se estrena. Si ya la viste en preestreno, márcalo desde la ficha.",
        { reason: "not_released" },
      );
    }
    throw new ApiError("not_found");
  }
  const state = await getOwnTitleState(user.id, id);
  if (!state) throw new ApiError("not_found");
  return json(toTitleState(state));
});
