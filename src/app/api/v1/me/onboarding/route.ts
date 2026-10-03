import { ApiError, withApi } from "@/authz/api";
import { z } from "zod";
import { completeOnboarding, onboardingSchema } from "@/modules/account/onboarding";
import { displayNameSchema } from "@/modules/account/profile";
import { json, readJson } from "../../_lib/http";
import { freshMe } from "../../_lib/me";
import { UNDERAGE_MESSAGE } from "../../_lib/sign-in";

/**
 * POST /api/v1/me/onboarding { name?, birthDate } → Me (§4 Cuenta). F2.1
 * step 3 + F2.2 minor gate, same module as the web.
 *
 * `birthDate` ("YYYY-MM-DD"): the server computes the EXACT age against
 * today's UTC date and stores only the year. Under 13: the account is marked
 * blocked (this bearer and every future sign-in are 401 from now on) and the
 * answer is 403 `forbidden` + `reason: "underage"` — the app shows the
 * 13-years screen. No `Me` is built on that path: the user loader already
 * refuses the row. Not a real day / in the future / before 1900 / missing →
 * 400 `invalid` + `fields.birthDate`, nothing written.
 *
 * Legacy `birthYear` (integer; builds that predate the date — `birthDate`
 * wins when both arrive): ≥ 14 years of difference passes and ≤ 12 is
 * `underage`, as before; EXACTLY 13 can't tell 12 from 13 → 400 `invalid` +
 * `fields.birthYear` asking for the full date, nothing written, nobody
 * blocked.
 *
 * `name`: required and validated (1..50) for an account that has none — 400
 * `invalid` + `fields.name`, nothing written. An account that ALREADY has a
 * name may omit it (or re-send the stored one, even if it no longer passes
 * the rule): the year is recorded and the name is left as is.
 */
export const POST = withApi(async (request, { user }) => {
  const input = await readJson(request, onboardingSchema);
  const result = await completeOnboarding(user.id, input);
  if (!result.ok && result.error === "invalid_birth") {
    throw new ApiError("invalid", result.message, { fields: { [result.field]: result.message } });
  }
  if (!result.ok && result.error === "name_required") {
    // The same 400 + `fields.name` the schema used to answer.
    z.object({ name: displayNameSchema }).parse({ name: input.name });
    throw new ApiError("invalid", undefined, { fields: { name: "Escribe tu nombre." } });
  }
  if (!result.ok) {
    throw new ApiError(
      "forbidden",
      UNDERAGE_MESSAGE,
      { reason: "underage" },
    );
  }
  return json(await freshMe(user.id));
});
