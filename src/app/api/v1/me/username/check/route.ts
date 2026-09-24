import { z } from "zod";
import { withApi } from "@/authz/api";
import { checkUsername } from "@/modules/account/username";
import { json, readQuery } from "../../../_lib/http";

const querySchema = z.object({ u: z.string().max(200).default("") });

/**
 * GET /api/v1/me/username/check?u= → { status: "free" | "taken" | "invalid" }
 * (§4 Cuenta). Read-only twin of `PUT /me/username`: same normalization,
 * same regex, same RESERVED set. The caller's own current handle reads as
 * "free". Anything malformed (or reserved, or absent) is `invalid`, not a
 * 400 — the field is being typed live.
 */
export const GET = withApi(async (request, { user }) => {
  const { u } = readQuery(request, querySchema);
  const status = await checkUsername(user.id, user.username, u);
  return json({ status });
});
