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
};

export default nextConfig;
