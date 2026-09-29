/**
 * The product's public origin — ONE place. Share links, `metadataBase`,
 * the emails, the printed "es tu link" copy and the host redirects in
 * `next.config.ts` all read it; never spell the host out elsewhere.
 *
 * 2026-09-29: the domain moved from baclog.app to get-kura.app (the brand is
 * Kura since 2026-09-24). The old hosts stay attached to the same Vercel
 * project and 308 to `SITE_URL` for web traffic (see `next.config.ts`), but
 * keep answering `/api/*` and `/.well-known/*` themselves: installed iOS
 * builds still talk to `https://baclog.app/api/v1`, and Apple's CDN refuses a
 * redirected AASA (the legacy `applinks:baclog.app` entitlement keeps old
 * shared links opening the app). Drop `LEGACY_HOSTS` from the redirect only
 * once no build pointing at the old host is out there.
 *
 * Kept safe for client components: no server-only imports here.
 */
export const SITE_HOST = "get-kura.app";
export const SITE_URL = `https://${SITE_HOST}`;

/** Hosts the site answered on before 2026-09-29 (web traffic 308s to `SITE_URL`). */
export const LEGACY_HOSTS = ["baclog.app", "www.baclog.app"] as const;
