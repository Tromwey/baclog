import type { NextConfig } from "next";
import { LEGACY_HOSTS, SITE_HOST, SITE_URL } from "./src/lib/site";

const nextConfig: NextConfig = {
  /**
   * Dev only: let a phone on the same Wi-Fi load the dev server by LAN IP
   * (Next 16 blocks cross-origin requests to dev assets/HMR by default, so
   * the page would render but never hydrate). No effect on production.
   */
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  experimental: {
    /**
     * Client router cache for DYNAMIC pages (default 0 = every soft nav
     * re-fetches the whole RSC payload — dock tab switches felt slow and/or
     * flashed loading states). 30s keeps visited destinations instant while
     * navigating around; server actions' revalidatePath still purges this
     * cache immediately, so mutations never show stale data.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  /**
   * Clean public URLs: get-kura.app/{username}, /{username}/item/{id} and
   * /{username}/{backlogId} — the pretty form the exported cards' watermark and
   * Web Share text point at — proxied onto the /u/... routes the pages actually
   * live at. These live in `fallback`, which Next checks AFTER every real route
   * and static asset (rewrites.md: step 8): /login, /backlogs, /item/{id}, etc.
   * all resolve normally, and ONLY a path that matches nothing (i.e. a bare
   * username) falls through here. That's why the rewrite needs no reserved-route
   * allowlist — the one guard is claimUsernameAction's RESERVED set, which stops
   * a handle from shadowing a real top-level route.
   */
  /**
   * One canonical host. The legacy hosts (baclog.app, www.baclog.app — still
   * attached to the Vercel project so old links keep resolving) and
   * www.get-kura.app 308 every WEB path to https://get-kura.app, query string
   * included. `/api/*` and `/.well-known/*` are deliberately left alone: the
   * installed iOS builds call `https://baclog.app/api/v1` (URLSession would
   * drop the bearer on a cross-host redirect), and Apple's CDN refuses a
   * redirected apple-app-site-association. See `src/lib/site.ts`.
   */
  /**
   * Security headers on EVERY response (pages, route handlers, static files,
   * and the redirects/rewrites below — `headers` is matched before the
   * filesystem and adds to whatever the route sets; it never changes a
   * status or a Location, so the legacy-host 308s and `/api/*` on baclog.app
   * behave exactly as before):
   *  - nothing of ours is meant to be framed, so no other origin may embed
   *    it (clickjacking on Seguir / Publicar / borrar cuenta). Both forms:
   *    `frame-ancestors` is the standard, `X-Frame-Options` the legacy twin
   *    (and the only one on a `/api/avatar/*` 404, which carries no CSP). An
   *    <img> is not framing: avatars,
   *    covers and OG cards keep loading everywhere.
   *  - `nosniff`: a response is what its Content-Type says (the avatar route
   *    serves user-uploaded bytes under a sniffed image type).
   * This CSP carries ONLY `frame-ancestors`: it restricts no script, style,
   * image or connection.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // Everything EXCEPT `/api/avatar/*`, which sends its own, stricter
        // CSP (`default-src 'none'; sandbox; frame-ancestors 'none'`). A
        // header set here is already on the response when a route handler's
        // own headers are copied over, and Next keeps the one that is
        // already there (`send-response.js`: a single-valued header is only
        // appended when absent) — so the global value REPLACED the avatar's
        // and user-uploaded bytes were served without `sandbox`.
        source: "/((?!api/avatar/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
    ];
  },
  async redirects() {
    return [...LEGACY_HOSTS, `www.${SITE_HOST}`].map((host) => ({
      source: "/:path((?!api/|\\.well-known/).*)",
      has: [{ type: "host" as const, value: host }],
      destination: `${SITE_URL}/:path`,
      permanent: true,
    }));
  },
  async rewrites() {
    return {
      // The Mausoleum of /party is the design's own page, served verbatim from public/ (not a Next route).
      beforeFiles: [{ source: "/party/mausoleo", destination: "/party/mausoleo/index.html" }],
      fallback: [
        {
          source: "/:username/item/:catalogItemId",
          destination: "/u/:username/item/:catalogItemId",
        },
        {
          source: "/:username/:backlogId",
          destination: "/u/:username/:backlogId",
        },
        { source: "/:username", destination: "/u/:username" },
      ],
    };
  },
};

export default nextConfig;
