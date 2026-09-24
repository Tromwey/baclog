import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { claimUsername } from "@/modules/account/username";
import { json, readJson } from "../../_lib/http";
import { freshMe } from "../../_lib/me";

const bodySchema = z.object({ username: z.string().max(200) });

/**
 * PUT /api/v1/me/username { username } → Me (§4 Cuenta). F2.17: claiming
 * also sets `isPublic = true`, and the `Me` returned reflects it. 400
 * `invalid` for a handle that can never be claimed (shape or RESERVED), 409
 * `conflict` + `reason: "taken"` when the unique index says someone owns it.
 */
export const PUT = withApi(async (request, { user }) => {
  const { username } = await readJson(request, bodySchema);
  const result = await claimUsername(user.id, username);
  if (!result.ok) {
    if (result.error === "taken") {
      throw new ApiError(
        "conflict",
        "Ese nombre de usuario ya está en uso. Prueba otro.",
        { reason: "taken" },
      );
    }
    throw new ApiError(
      "invalid",
      "Ese nombre de usuario no se puede usar. Usa de 3 a 30 letras minúsculas, números, punto o guion bajo.",
      { fields: { username: "No disponible" } },
    );
  }
  return json(await freshMe(user.id));
});
