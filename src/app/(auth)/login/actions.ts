"use server";

import { signIn } from "@/auth";
import { safeReturnTo } from "@/lib/return-to";

/**
 * "Continuar con Apple" (the /login form's server action): starts Auth.js's
 * Apple redirect flow. `signIn` throws Next's redirect to appleid.apple.com;
 * the callback lands the signed-in person on the form's `to` — re-validated
 * HERE with `safeReturnTo` (a hidden input is client data: only `/f/{token}`
 * or `/c/{uuid}` pass, contract §3) — or on /backlogs (the app layout then
 * sends a new account to /onboarding). A refusal lands on
 * /login?error=apple, carrying the same `to` (auth/config.ts
 * `appleErrorUrl`).
 */
export async function continueWithAppleAction(formData: FormData): Promise<void> {
  const raw = formData.get("to");
  const to = safeReturnTo(typeof raw === "string" ? raw : null);
  await signIn("apple", { redirectTo: to ?? "/backlogs" });
}
