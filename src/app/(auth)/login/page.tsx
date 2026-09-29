import { appleWebSignInEnabled } from "@/auth/apple-web";
import { LoginForm } from "./login-form";

/**
 * /login — server shell: decides whether "Continuar con Apple" is offered
 * (the web Services ID and the Apple key are configured, kill-switch off)
 * and reads Auth.js's `?error=` (a refused Apple callback) so the form can
 * say so in words. The form itself is the client component next door.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  return <LoginForm appleEnabled={appleWebSignInEnabled()} error={errorCode ? "apple" : null} />;
}
