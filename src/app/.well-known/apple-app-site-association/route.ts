/**
 * Universal Links for the native app (Kura iOS, `com.tromwey.kura`).
 *
 * iOS fetches this file (through Apple's CDN) when the app is installed and,
 * for every tapped `https://get-kura.app/…` link (and the legacy
 * `https://baclog.app/…` ones), checks `components` in order:
 * the FIRST rule that matches decides, and `exclude: true` means "leave it to
 * Safari". The app only receives what it can open (`ios/Kura/App/DeepLinks.swift`
 * parses the same shapes); everything else stays on the web.
 *
 * AASA patterns: `*` matches any run of characters INCLUDING `/`, `?` exactly
 * one. So `/*` (a profile, `/{handle}`) would swallow the whole site — that is
 * why every real top-level route (the `RESERVED` handles of
 * `modules/account/username.ts`, which can never be a username) is excluded
 * first, plus static files. Keep both lists in sync when a top-level route is
 * added.
 *
 * Requirements Apple enforces: served over HTTPS at exactly this path, 200 with
 * NO redirect, `application/json`, no auth. There is no middleware/proxy in
 * this app and real routes win over the `next.config.ts` fallback rewrites, so
 * nothing intercepts it — the host redirects in `next.config.ts` skip
 * `/.well-known/*` on purpose, so the legacy apex (baclog.app) still serves it
 * for the `applinks:baclog.app` entitlement that keeps old shared links opening
 * the app. `www.*` redirects to the apex, so only the apexes are declared in
 * the app's entitlement (`applinks:get-kura.app` + `applinks:baclog.app`).
 */

export const dynamic = "force-static";

const APP_ID = "F975J7TBHP.com.tromwey.kura";

/** Top-level routes that are never a handle (mirror of `RESERVED`, plus a few paths that only exist as files). */
const EXCLUDED_ROOTS = [
  "admin", "api", "app", "baclog", "kura", "colecciones", "coleccion", "blocked", "descubrir",
  "login", "onboarding", "para-ti", "perfil", "prototype", "search", "settings",
  "verify", "www", "waitlist", "analytics", "cron", "marketing", "feed", "creditos", "privacidad", "party",
  "_next", ".well-known",
];

const exclude = (path: string) => ({ "/": path, exclude: true });

const association = {
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [
          // The landing page stays on the web.
          exclude("/"),
          // Static files (a handle can hold a dot, e.g. `mariel.ok`, but never these endings).
          ...["*.png", "*.svg", "*.ico", "*.webmanifest", "*.txt", "*.xml", "*.json"].map((p) => exclude(`/${p}`)),
          // Real routes: the bare path and everything under it.
          ...EXCLUDED_ROOTS.flatMap((r) => [exclude(`/${r}`), exclude(`/${r}/*`)]),
          // Web-only pages under the routes the app does open: the card exporters
          // (/item/{id}/card, /backlogs/{id}/card), the lenses, the recap card and past months,
          // and the bare indexes (a bare /item or /u would otherwise fall to `/*` as a "handle").
          exclude("/item"), exclude("/item/*/*"),
          exclude("/backlogs"), exclude("/backlogs/lentes"), exclude("/backlogs/lentes/*"), exclude("/backlogs/*/*"),
          exclude("/u"), exclude("/recap/*"),
          { "/": "/recap", comment: "your recap" },
          // A title (the app route and the release email link).
          { "/": "/item/*", comment: "title" },
          // Your own collection (web app route).
          { "/": "/backlogs/*", comment: "own collection" },
          // The public routes the clean URLs rewrite onto.
          { "/": "/u/*", comment: "public profile, collection or title" },
          // Clean public URLs: /{handle}, /{handle}/{collectionId}, /{handle}/item/{titleId}.
          { "/": "/*", comment: "public profile, collection or title" },
        ],
      },
    ],
  },
};

export function GET() {
  return Response.json(association, {
    headers: {
      // Apple's CDN re-fetches on its own schedule; this only bounds OUR edge.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
