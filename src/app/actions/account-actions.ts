"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signOut } from "@/auth";
import { assertUser } from "@/authz";
import { db } from "@/db";
import { users, type preferredServiceEnum } from "@/db/schema";

const MIN_AGE = 13;

const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(50),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
});

/**
 * F2.1 step 3 + F2.2 minor gate. Under-13: mark blocked and bail — the
 * isMinor flag makes getCurrentUser() return null everywhere (effective
 * sign-out) and prevents re-onboarding with a different year.
 */
export async function completeOnboardingAction(input: {
  name: string;
  birthYear: number;
}) {
  const user = await assertUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };

  const age = new Date().getFullYear() - parsed.data.birthYear;
  if (age < MIN_AGE) {
    await db
      .update(users)
      .set({ isMinor: true, birthYear: parsed.data.birthYear })
      .where(eq(users.id, user.id));
    redirect("/blocked");
  }

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      birthYear: parsed.data.birthYear,
      isMinor: false,
    })
    .where(eq(users.id, user.id));
  return { ok: true as const };
}

type PreferredService = (typeof preferredServiceEnum.enumValues)[number];

export async function setPreferredServiceAction(service: PreferredService) {
  const user = await assertUser();
  const valid = ["spotify", "apple_music", "youtube_music"] as const;
  if (!valid.includes(service)) return { error: "invalid" as const };
  await db
    .update(users)
    .set({ preferredService: service })
    .where(eq(users.id, user.id));
  return { ok: true as const };
}

/**
 * Onboarding step 2: server-side redirect on purpose — a client
 * router.push here can replay the stale "/backlogs → /onboarding"
 * redirect cached before onboarding completed.
 */
export async function chooseServiceAndFinishAction(service: PreferredService) {
  await setPreferredServiceAction(service);
  redirect("/backlogs");
}

export async function updateDisplayNameAction(name: string) {
  const user = await assertUser();
  const parsed = z.string().trim().min(1).max(50).safeParse(name);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(users)
    .set({ name: parsed.data })
    .where(eq(users.id, user.id));
  return { ok: true as const };
}

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const RESERVED = new Set([
  "admin", "api", "app", "baclog", "backlogs", "blocked", "item", "login",
  "onboarding", "prototype", "search", "settings", "u", "verify", "www",
  "waitlist", "recap", "analytics", "cron", "marketing",
]);

/** F2.17 — claiming implies opting in to a public page (toggleable). */
export async function claimUsernameAction(username: string) {
  const user = await assertUser();
  const normalized = username.trim().toLowerCase();
  if (!USERNAME_RE.test(normalized) || RESERVED.has(normalized)) {
    return { error: "invalid" as const };
  }
  try {
    await db
      .update(users)
      .set({ username: normalized, isPublic: true })
      .where(eq(users.id, user.id));
  } catch {
    // unique index violation — someone owns it
    return { error: "taken" as const };
  }
  revalidatePath(`/u/${normalized}`, "layout");
  return { ok: true as const, username: normalized };
}

export async function setPublicAction(isPublic: boolean) {
  const user = await assertUser();
  await db
    .update(users)
    .set({ isPublic: Boolean(isPublic) })
    .where(eq(users.id, user.id));
  // Privacy must be immediate — bust the ISR cache for the public tree
  if (user.username) revalidatePath(`/u/${user.username}`, "layout");
  return { ok: true as const };
}

/**
 * F2.4 — deletes the user row; every user-owned table cascades (backlogs,
 * items, sessions, reports-against). catalog_items/media_links are shared
 * cache, not user data. No "why are you leaving" email — just gone.
 */
export async function deleteAccountAction() {
  const user = await assertUser();
  await db.delete(users).where(eq(users.id, user.id));
  await signOut({ redirect: false });
  redirect("/login");
}
