import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    /** Phase 4b: the `users.token_version` the cookie was minted at (0 for
     *  a pre-4b cookie). Compared by `getCurrentUser` (src/auth/session.ts). */
    tv?: number;
  }
  interface User {
    /** Phase 4b: set by `authorize` (src/auth/config.ts), copied into the
     *  JWT by the `jwt` callback. */
    tv?: number;
  }
}
