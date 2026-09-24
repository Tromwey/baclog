import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { displayNameSchema } from "./profile";

/**
 * F2.1 step 3 + F2.2 minor gate — shared by `completeOnboardingAction` (web)
 * and `POST /me/onboarding` (API). Takes a `userId`: never a "use server"
 * file. Knows nothing about redirects: the web action sends the minor to
 * /blocked, the API answers 403 `underage`.
 */

export const MIN_AGE = 13;

export const onboardingSchema = z.object({
  name: displayNameSchema,
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export type OnboardingResult = { ok: true } | { ok: false; error: "underage" };

/**
 * Under MIN_AGE: mark blocked and bail — the `isMinor` flag makes
 * `loadUserById` (cookie AND bearer) return null everywhere, an effective,
 * permanent sign-out, and prevents re-onboarding with a different year.
 * `birthYear` is written and never read back out (F2.2).
 */
export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const age = new Date().getFullYear() - input.birthYear;
  if (age < MIN_AGE) {
    await db
      .update(users)
      .set({ isMinor: true, birthYear: input.birthYear })
      .where(eq(users.id, userId));
    return { ok: false, error: "underage" };
  }
  await db
    .update(users)
    .set({ name: input.name, birthYear: input.birthYear, isMinor: false })
    .where(eq(users.id, userId));
  return { ok: true };
}
