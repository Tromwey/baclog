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
  /** Vercel Cron bearer token — protects /api/cron/* (F3.3) */
  get CRON_SECRET() {
    return required("CRON_SECRET");
  },
  /** Optional: fixtures when absent (launch dep, founder-provided) */
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  /** Optional: console mailer when absent (launch dep, founder-provided) */
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  /** Optional: Odesli keyless free tier when absent */
  ODESLI_API_KEY: process.env.ODESLI_API_KEY,
  /**
   * Optional (F3.5.5): the cross-media reco engine has three providers behind
   * one interface — deterministic FIXTURE (default, no key: build/test never
   * blocks), Anthropic Claude, and Google Gemini (free tier). Provider is
   * chosen by CROSSMEDIA_PROVIDER, else auto: Gemini if its key is set (free),
   * else Anthropic, else fixture. Real keys swap in with no other code change.
   */
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  /** Optional (F3.5.5): Google Gemini free-tier key — the low-cost provider */
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  /** Optional: override the Gemini model (default gemini-2.0-flash, free tier) */
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  /** Optional: force a provider — "gemini" | "anthropic" | "fixture" */
  CROSSMEDIA_PROVIDER: process.env.CROSSMEDIA_PROVIDER,
};
