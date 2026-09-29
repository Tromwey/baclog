"use server";

import { signIn } from "@/auth";

/**
 * "Continuar con Apple" (the /login form's server action): starts Auth.js's
 * Apple redirect flow. `signIn` throws Next's redirect to appleid.apple.com;
 * the callback lands the signed-in person on /backlogs (the app layout then
 * sends a new account to /onboarding), and any refusal on /login?error=apple.
 */
export async function continueWithAppleAction(): Promise<void> {
  await signIn("apple", { redirectTo: "/backlogs" });
}
