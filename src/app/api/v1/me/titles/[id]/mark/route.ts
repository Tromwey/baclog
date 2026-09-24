import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { getOwnTitleState, setMark } from "@/modules/backlog/state";
import { json, readJson } from "../../../../_lib/http";
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
 * 404 when the title isn't in the caller's library (mark a saved title only —
 * membership first). 409 `not_released` when `releaseDate > now` and the
 * app didn't say `preview`.
 */
export const PUT = withApi<{ id: string }>(async (request, { user, params }) => {
  const body = await readJson(request, BodySchema);
  const res = await setMark(user.id, params.id, body.mark, { preview: body.preview });
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
  const state = await getOwnTitleState(user.id, params.id);
  if (!state) throw new ApiError("not_found");
  return json(toTitleState(state));
});
