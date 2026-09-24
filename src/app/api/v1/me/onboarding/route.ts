import { ApiError, withApi } from "@/authz/api";
import { completeOnboarding, onboardingSchema } from "@/modules/account/onboarding";
import { json, readJson } from "../../_lib/http";
import { freshMe } from "../_lib/fresh-me";

/**
 * POST /api/v1/me/onboarding { name, birthYear } → Me (§4 Cuenta). F2.1
 * step 3 + F2.2 minor gate, same module as the web. Under 13: the account
 * is marked blocked (this bearer and every future sign-in are 401 from now
 * on) and the answer is 403 `forbidden` + `reason: "underage"` — the app
 * shows the 13-years screen. No `Me` is built on that path: the user loader
 * already refuses the row.
 */
export const POST = withApi(async (request, { user }) => {
  const input = await readJson(request, onboardingSchema);
  const result = await completeOnboarding(user.id, input);
  if (!result.ok) {
    throw new ApiError(
      "forbidden",
      "Kura es para mayores de 13 años. Esta cuenta no puede entrar.",
      { reason: "underage" },
    );
  }
  return json(await freshMe(user.id));
});
