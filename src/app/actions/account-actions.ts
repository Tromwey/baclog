"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { assertUser, notOnboarded } from "@/authz";
import { deleteAccount } from "@/modules/account/delete";
import { completeOnboarding, onboardingSchema } from "@/modules/account/onboarding";
import {
  displayNameSchema,
  followListsVisibilitySchema,
  preferredServiceSchema,
  updateProfile,
  type PreferredService,
} from "@/modules/account/profile";
import { checkUsername, claimUsername } from "@/modules/account/username";

/**
 * Account actions — thin wrappers: `assertUser()` → `src/modules/account/*`
 * → revalidate/redirect. The logic lives in the modules so the API v1
 * handlers (`/api/v1/me/**`) share it byte for byte; nothing here may grow a
 * rule the modules don't have.
 */

/**
 * F2.1 step 3 + F2.2 minor gate. Under-13: the module marks the account
 * blocked (getCurrentUser() returns null everywhere from now on) and we
 * bail to /blocked.
 *
 * The age is exact (founder, 2026-10-01): send `birthDate` ("YYYY-MM-DD").
 * `birthYear` is still accepted — the legacy field, same three tiers as
 * `POST /api/v1/me/onboarding` (modules/account/age.ts); `birthDate` wins
 * when both are sent. A birth input that can't be used answers `invalid`
 * with `fields.birthDate` / `fields.birthYear` (final copy) and writes
 * nothing; a missing name stays a bare `invalid`.
 */
export async function completeOnboardingAction(input: {
  /** Optional ONLY for an account that already has a name (an older one
   *  passing the age gate late): it completes with the date alone and its
   *  stored name is left as is. A new account without a valid name gets
   *  `invalid` and nothing is written (`completeOnboarding`). */
  name?: string;
  birthDate?: string;
  /** Legacy (year only). */
  birthYear?: number;
}): Promise<
  // `error?: undefined` / `ok?: undefined`: the shape TypeScript used to infer
  // here — callers read `res.error` without narrowing first.
  | { ok: true; error?: undefined }
  | {
      error: "invalid";
      ok?: undefined;
      fields?: Partial<Record<"birthDate" | "birthYear", string>>;
    }
> {
  const user = await assertUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  const result = await completeOnboarding(user.id, parsed.data);
  if (!result.ok) {
    if (result.error === "name_required") return { error: "invalid" };
    if (result.error === "invalid_birth") {
      return { error: "invalid", fields: { [result.field]: result.message } };
    }
    redirect("/blocked");
  }
  return { ok: true };
}

export async function setPreferredServiceAction(service: PreferredService) {
  const user = await assertUser();
  const parsed = preferredServiceSchema.safeParse(service);
  if (!parsed.success) return { error: "invalid" as const };
  await updateProfile(user.id, { preferredService: parsed.data });
  return { ok: true as const };
}

/**
 * Onboarding's terminal step (3, after the username claim): server-side
 * redirect on purpose — a client router.push here can replay the stale
 * "/backlogs → /onboarding" redirect cached before onboarding completed.
 * Keep this step last so the flow's only navigation stays server-side.
 */

export async function updateDisplayNameAction(name: string) {
  const user = await assertUser();
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) return { error: "invalid" as const };
  // F2.2: a name is only written to an account that passed the age gate
  // (enforced in `updateProfile`); the first name comes from onboarding.
  const result = await updateProfile(user.id, { name: parsed.data });
  if (!result.ok) return { error: result.error };
  return { ok: true as const };
}

/**
 * F2.17 — claiming your FIRST handle implies opting in to a public page
 * (toggleable); a rename leaves `isPublic` alone (modules/account/username.ts).
 *
 * `refresh: false` (onboarding, 2026-09-03): skips the `revalidatePath`. The
 * public tree is dynamic (never ISR-cached) so the revalidate only ever acted
 * as a router refresh — and during onboarding that refresh re-requests the
 * URL the client router still holds from the login redirect chain (`/`),
 * which now resolves to /backlogs and yanks the user out of step 1.
 *
 * F2.2: needs a finished onboarding (`onboarding_required`). The web has no
 * "claim before onboarding" order to protect — `username-step.tsx` calls
 * `completeOnboardingAction` FIRST and claims after — so, unlike
 * `PUT /api/v1/me/username` (the apps claim before `POST /me/onboarding`),
 * this action is gated outright.
 */
export async function claimUsernameAction(
  username: string,
  { refresh = true }: { refresh?: boolean } = {},
) {
  const user = await assertUser();
  if (notOnboarded(user)) return { error: "onboarding_required" as const };
  const result = await claimUsername(user.id, username);
  if (!result.ok) return { error: result.error };
  if (refresh) revalidatePath(`/u/${result.username}`, "layout");
  return { ok: true as const, username: result.username };
}

/**
 * Kura O1b "elige tu usuario" — the live "libre / ocupado" beside the field.
 * Read-only twin of claimUsernameAction (see modules/account/username.ts).
 */
export async function checkUsernameAction(username: string) {
  const user = await assertUser();
  const status = await checkUsername(user.id, user.username, username);
  return { status };
}

export async function setPublicAction(isPublic: boolean) {
  const user = await assertUser();
  // F2.2: going public needs a finished onboarding (`updateProfile`).
  const result = await updateProfile(user.id, { isPublic: Boolean(isPublic) });
  if (!result.ok) return { error: result.error };
  // Privacy must be immediate — bust the ISR cache for the public tree
  if (user.username) revalidatePath(`/u/${user.username}`, "layout");
  return { ok: true as const };
}

/**
 * F3.8 — the release email's opt-out. No revalidatePath: nothing cached
 * renders this, and the only reader is the daily cron.
 */
export async function setNotifyReleasesAction(notifyReleases: boolean) {
  const user = await assertUser();
  await updateProfile(user.id, { notifyReleases: Boolean(notifyReleases) });
  return { ok: true as const };
}

/**
 * Phase 4b — the monthly recap email's opt-out. Same posture as
 * `setNotifyReleasesAction`: nothing cached renders it, the only reader is
 * the monthly cron (`api/cron/recap`).
 */
export async function setNotifyRecapAction(notifyRecap: boolean) {
  const user = await assertUser();
  await updateProfile(user.id, { notifyRecap: Boolean(notifyRecap) });
  return { ok: true as const };
}

/**
 * 2026-09-27 — who reads your followers / following lists: 'public' ·
 * 'mutuals' · 'private' (modules/social/follow-lists-policy.ts). Validated
 * here too (a server action is an RPC: the client's value is untrusted). No
 * revalidatePath: no cached page renders someone's lists — every list read
 * (`GET /people/{h}/followers|following`) resolves access at query time, so
 * the change is immediate.
 */
export async function setFollowListsVisibilityAction(visibility: string) {
  const user = await assertUser();
  const parsed = followListsVisibilitySchema.safeParse(visibility);
  if (!parsed.success) return { error: "invalid" as const };
  await updateProfile(user.id, { followListsVisibility: parsed.data });
  return { ok: true as const };
}

/**
 * F2.4 — deletes the account (modules/account/delete.ts: the row + every
 * cascade). Two-step: clear the JWT cookie, then redirect (signOut's own
 * redirect isn't trusted).
 */
export async function deleteAccountAction() {
  const user = await assertUser();
  await deleteAccount(user.id);
  await signOut({ redirect: false });
  redirect("/login");
}

/**
 * Plain sign-out (M3.5 Perfil). No confirmation, no assertUser — signing out
 * shouldn't depend on a valid session. Two-step like deleteAccountAction:
 * clear the JWT cookie, then redirect (signOut's own redirect isn't trusted).
 */
export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}
