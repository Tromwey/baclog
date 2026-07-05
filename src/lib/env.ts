import "server-only";

/**
 * Typed env accessor. Required vars throw at first access (fail fast on
 * misconfigured deploys); optional vars gate feature implementations —
 * e.g. absent TMDB_API_KEY switches the catalog to fixtures (build/test
 * must never block on launch-only credentials).
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return required("AUTH_SECRET");
  },
  /** Optional: fixtures when absent (launch dep, founder-provided) */
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  /** Optional: console mailer when absent (launch dep, founder-provided) */
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  /** Optional: Odesli keyless free tier when absent */
  ODESLI_API_KEY: process.env.ODESLI_API_KEY,
};
