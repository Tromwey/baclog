import { appleWebSignInEnabled } from "@/auth/apple-web";
import { safeReturnTo } from "@/lib/return-to";
import { LoginForm } from "./login-form";

/**
 * /login — server shell: decides whether "Continuar con Apple" is offered
 * (the web Services ID and the Apple key are configured, kill-switch off)
 * and reads Auth.js's `?error=` (a refused Apple callback) so the form can
 * say so in words. The form itself is the client component next door.
 *
 * `?to=` (colecciones de fiesta, contract §3) survives every way in: the
 * email path carries it to /verify (`carryReturnTo`), the Apple path posts
 * it as a hidden input (`continueWithAppleAction` re-validates it) and a
 * refused Apple callback comes back here with it. Only `safeReturnTo`
 * shapes are ever passed down.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; to?: string | string[] }>;
}) {
  const { error, to } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const returnTo = safeReturnTo(Array.isArray(to) ? to[0] : to);
  return (
    <LoginForm appleEnabled={appleWebSignInEnabled()} error={errorCode ? "apple" : null} returnTo={returnTo} />
  );
}
