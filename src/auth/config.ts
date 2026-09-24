import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { consumeWebHandoff } from "@/authz/handoff";
import { verifyOtp } from "./otp";
import { readTokenVersion } from "./user-row";

const RID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The request id the handoff route passes in (`rid`), so its log line and
 *  this one correlate. Only a UUID is accepted — the callback is reachable
 *  directly with any form body, and a free-text value in a log line is a
 *  log-injection vector — otherwise a fresh one. */
function handoffRid(raw: unknown): string {
  return typeof raw === "string" && RID_RE.test(raw) ? raw : crypto.randomUUID();
}

/**
 * JWT session strategy — deliberate deviation from "database" sessions:
 * Auth.js v5 does not create session rows for Credentials sign-ins, so DB
 * sessions with an OTP/Credentials flow require manual session management.
 * Instead, the JWT only carries the user id; requireUser() re-reads the
 * user row on every request, which gives the two properties DB sessions
 * were wanted for:
 *  - instant revocation: account deletion removes the row → next request
 *    is treated as signed out (F2.4)
 *  - fresh profile fields (username, preferredService) on every request
 *
 * Phase 4b — the cookie also carries `tv` (= `users.token_version` when it
 * was minted: `authorize` returns it, the `jwt` callback copies it into the
 * token, the `session` callback exposes it), and `getCurrentUser`
 * (session.ts) compares it with the column in the SAME row re-read: after
 * `POST /api/v1/auth/logout` ("cerrar sesión en todos lados") every web
 * cookie of the account — including the one a handoff minted from a bearer —
 * reads as signed out, not only the bearers. A cookie minted before 4b has
 * no `tv` = 0 = the column default: it lives until the account's first
 * logout. `tv` is the account's own counter, not a secret; it rides in the
 * encrypted cookie and shows up in the owner's own `/api/auth/session`.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "otp",
      name: "Email code",
      credentials: { email: {}, code: {}, handoff: {}, rid: {} },
      /**
       * Two modes, never mixed:
       *  - `{ email, code }` — the web OTP form (unchanged).
       *  - `{ handoff }` — phase 4b: the one-shot JWS the app gets from
       *    `POST /api/v1/auth/web-session` and opens at `/api/auth/handoff`.
       *    `consumeWebHandoff` verifies signature/aud/exp/`tv` AND burns the
       *    single-use row HERE, because this callback is also reachable
       *    straight at `POST /api/auth/callback/otp` — enforcing single use
       *    only in the GET route would let a used URL be replayed at the
       *    callback (src/authz/handoff.ts).
       * A request that carries `handoff` is handoff mode even if it also
       * carries email/code: it never falls through to the OTP check.
       * A refused handoff is logged here with its reason (`[auth/handoff]
       * rid=… reason=…`) — the only place that knows it; the client still
       * gets the one uniform refusal.
       * Both modes return `tv` (the account's `token_version`) for the cookie.
       */
      async authorize(credentials) {
        if (credentials?.handoff !== undefined) {
          const rid = handoffRid(credentials.rid);
          const result = await consumeWebHandoff(String(credentials.handoff));
          if (!result.ok) {
            const line = `[auth/handoff] rid=${rid} reason=${result.reason}`;
            if (result.reason === "db_error") console.error(line, result.cause);
            else console.warn(line);
            return null;
          }
          const { user, tokenVersion } = result;
          return { id: user.id, email: user.email, name: user.name, tv: tokenVersion };
        }
        const email = String(credentials?.email ?? "");
        const code = String(credentials?.code ?? "");
        if (!email || !code) return null;
        const user = await verifyOtp(email, code);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, tv: await readTokenVersion(user.id) };
      },
    }),
  ],
  callbacks: {
    // `user` is only present on the sign-in request (what `authorize`
    // returned); afterwards the token keeps the `tv` it was minted with.
    jwt({ token, user }) {
      if (user) token.tv = typeof user.tv === "number" ? user.tv : 0;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.tv = typeof token.tv === "number" ? token.tv : 0;
      return session;
    },
  },
});
