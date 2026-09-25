import { consumeMergeToken } from "@/authz/merge-token";
import { ApiError, withApi } from "@/authz/api";
import { MergeRaceError, mergeAccounts, mergeParties } from "@/modules/account/merge";
import { json, readJson } from "../../_lib/http";
import { mergeTokenInvalid } from "../../_lib/merge";
import { freshMe } from "../../_lib/me";
import { UNDERAGE_MESSAGE } from "../../_lib/sign-in";
import { MergeBodySchema, type MergeResult } from "../../_lib/schemas";

/**
 * POST /api/v1/me/merge { mergeToken } → 200 { user: Me } (phase 4g).
 *
 * The bearer's account is the DESTINATION (stays); the token's `src` is the
 * SOURCE (absorbed, then deleted). In order:
 *   1. `consumeMergeToken`: signature, `aud = kura-merge`, `exp`,
 *      `sub === bearer user`, `src !== sub`, and the single-use `jti` burned
 *      (`DELETE … RETURNING`). Any failure → ONE 409 `merge_token_invalid`
 *      (not 401: the bearer is valid; the app must not log out).
 *   2. Source gone → the same 409. Either side `isMinor` → 403 `underage`,
 *      NOTHING touched.
 *   3. `mergeAccounts` — one transaction; it re-checks both rows inside
 *      (a race there is the same 409).
 * After it, the source's sessions die with its row (bearers/cookies are 401
 * on their next re-read). The returned `Me` is the destination, fresh.
 */
export const POST = withApi(async (request, { user }) => {
  const { mergeToken } = await readJson(request, MergeBodySchema);
  const sourceId = await consumeMergeToken(mergeToken, user.id);
  if (!sourceId) throw mergeTokenInvalid();

  const { destination, source } = await mergeParties(user.id, sourceId);
  if (!destination) throw new ApiError("unauthorized");
  if (!source) throw mergeTokenInvalid();
  if (destination.isMinor || source.isMinor) {
    throw new ApiError("forbidden", UNDERAGE_MESSAGE, { reason: "underage" });
  }

  try {
    await mergeAccounts(user.id, sourceId);
  } catch (err) {
    if (err instanceof MergeRaceError) {
      console.error("[account/merge] guard", err.cause);
      throw mergeTokenInvalid();
    }
    throw err;
  }
  const body: MergeResult = { user: await freshMe(user.id) };
  return json(body);
});
