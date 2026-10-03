import { assertUser } from "@/authz";
import { onboardingRequiredError, withApi } from "@/authz/api";
import { deleteAccount } from "@/modules/account/delete";
import { profilePatchSchema, updateProfile } from "@/modules/account/profile";
import { json, noContent, readJson } from "../_lib/http";
import { buildMe, freshMe } from "../_lib/me";

/**
 * GET /api/v1/me → Me (§4 Cuenta).
 *
 * Resolves the user through `assertUser()` on purpose — the same choke point
 * server actions use — to exercise the `apiContext` bridge on every call:
 * if the AsyncLocalStorage hand-off ever broke, this endpoint would 401
 * instead of silently reading a cookie.
 */
export const GET = withApi(async () => {
  const user = await assertUser();
  return json(await buildMe(user));
});

/**
 * PATCH /api/v1/me { name?, preferredService?, notifyReleases?, notifyRecap?,
 * notifyFollowers?, isPublic?, followListsVisibility? } → Me. Same validation as the web actions
 * (`modules/account/profile.ts` is the one write path); a field left out is
 * left alone, an empty body is a no-op that still returns the current `Me`.
 * `followListsVisibility` ('public' | 'mutuals' | 'private', migration 0031)
 * is a zod enum: anything else is 400 `invalid` + `fields.followListsVisibility`.
 * `name` and `isPublic: true` need a finished onboarding (F2.2 age gate,
 * enforced inside `updateProfile`): before `POST /me/onboarding` they are
 * 403 `forbidden` + `reason: "onboarding_required"` and NOTHING is written.
 */
export const PATCH = withApi(async (request, { user }) => {
  const patch = await readJson(request, profilePatchSchema);
  const result = await updateProfile(user.id, patch);
  if (!result.ok) throw onboardingRequiredError();
  return json(await freshMe(user.id));
});

/**
 * DELETE /api/v1/me → 204. The account and everything it owns, gone
 * (`modules/account/delete.ts`); this bearer is revoked by the next re-read,
 * so the app must forget the token on 204.
 */
export const DELETE = withApi(async (_request, { user }) => {
  await deleteAccount(user.id);
  return noContent();
});
