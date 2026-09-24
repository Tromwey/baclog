"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { assertUser } from "@/authz";
import { deleteAccount } from "@/modules/account/delete";
import { completeOnboarding, onboardingSchema } from "@/modules/account/onboarding";
import {
  displayNameSchema,
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
 */
export async function completeOnboardingAction(input: {
  name: string;
  birthYear: number;
}) {
  const user = await assertUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };

  const result = await completeOnboarding(user.id, parsed.data);
  if (!result.ok) redirect("/blocked");
  return { ok: true as const };
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
  await updateProfile(user.id, { name: parsed.data });
  return { ok: true as const };
}

/**
 * F2.17 — claiming implies opting in to a public page (toggleable).
 *
 * `refresh: false` (onboarding, 2026-09-03): skips the `revalidatePath`. The
 * public tree is dynamic (never ISR-cached) so the revalidate only ever acted
 * as a router refresh — and during onboarding that refresh re-requests the
 * URL the client router still holds from the login redirect chain (`/`),
 * which now resolves to /backlogs and yanks the user out of step 1.
 */
export async function claimUsernameAction(
  username: string,
  { refresh = true }: { refresh?: boolean } = {},
) {
  const user = await assertUser();
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
  await updateProfile(user.id, { isPublic: Boolean(isPublic) });
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
