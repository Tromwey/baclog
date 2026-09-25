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
  /**
   * Optional (link-out fase 2): TIDAL API client credentials. Absent → the
   * TIDAL button degrades to the search deep link (not cached, so adding the
   * keys later needs no purge). Founder-provided, Production AND Preview.
   */
  TIDAL_CLIENT_ID: process.env.TIDAL_CLIENT_ID,
  TIDAL_CLIENT_SECRET: process.env.TIDAL_CLIENT_SECRET,
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
  /**
   * Optional (Kura iOS phase 4e/4f): the Apple developer key (.p8) with APNs
   * AND Sign in with Apple enabled — read through `appleKeyConfig()` in
   * src/auth/apple-key.ts (normalizes an escaped PEM). Absent → every push
   * is a logged no-op and the Apple code exchange (needed to revoke the
   * Apple link when an account is deleted) is skipped with a log; Apple
   * login itself still works (verifying the identity token needs no key).
   */
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_KEY_ID: process.env.APPLE_KEY_ID,
  APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
  /** Optional (phase 4f): kill-switch — "1"/"true" turns Sign in with Apple
   *  off (`auth/providers` says `apple: false`, `auth/apple` answers 503). */
  AUTH_APPLE_DISABLED: process.env.AUTH_APPLE_DISABLED,
  /** Optional (phase 4f): the iOS OAuth client id of Google Sign-In (the
   *  `aud` of its ID tokens; not a secret). Absent → `auth/google` answers
   *  503 and `auth/providers` says `google: null`. */
  GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID,
};
