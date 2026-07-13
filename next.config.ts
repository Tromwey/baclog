import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
   * Clean public URLs: baclog.app/{username}, /{username}/item/{id} and
   * /{username}/{backlogId} — the pretty form the exported cards' watermark and
   * Web Share text point at — proxied onto the /u/... routes the pages actually
   * live at. These live in `fallback`, which Next checks AFTER every real route
   * and static asset (rewrites.md: step 8): /login, /backlogs, /item/{id}, etc.
   * all resolve normally, and ONLY a path that matches nothing (i.e. a bare
   * username) falls through here. That's why the rewrite needs no reserved-route
   * allowlist — the one guard is claimUsernameAction's RESERVED set, which stops
   * a handle from shadowing a real top-level route.
   */
  async rewrites() {
    return {
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
