import NextAuth, { type NextAuthConfig } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { consumeWebHandoff } from "@/authz/handoff";
import { afterResponse } from "@/lib/after-response";
import { appleWebClientId, appleWebClientSecret, appleWebSignInEnabled } from "./apple-web";
import { verifyOtp } from "./otp";
import { linkOwner, saveAppleRefreshToken, signInWithIdentity } from "./social";
import type { VerifiedIdentity } from "./social-tokens";
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
/**
 * Sign in with Apple on the web (2026-09-29, src/auth/apple-web.ts) — the
 * `Apple` OIDC provider: authorization at appleid.apple.com, `form_post`
 * back to `/api/auth/callback/apple` (Auth.js sets its `state`/`nonce`
 * cookies to SameSite=None for that mode), code exchanged with the
 * `client_secret` minted from the APPLE_* key for the web Services ID, and
 * the id_token verified by Auth.js (Apple's JWKS, `aud` = the Services ID,
 * `nonce`). `profile` in the callbacks IS that verified id_token.
 *
 * Auth.js is used WITHOUT an adapter, so the callbacks map the Apple
 * identity onto Kura's own rows: `signIn` runs `signInWithIdentity` (the
 * phase 4f decision shared with the iOS route: `account(apple, sub)` link,
 * else a VERIFIED email → link or create, else refuse), and `jwt` swaps the
 * cookie's `sub` (Apple's, by default) for OUR user id and adds `tv`. A
 * minor is not refused here: like the OTP path, the session mints and every
 * `getCurrentUser` reads it as signed out (user-row.ts).
 *
 * The response's `refresh_token` is kept on the `account` row after the
 * response (what account deletion revokes — App Store 5.1.1(v)). Apple's
 * `user.name` (first consent only) is dropped on purpose: writing
 * `users.name` would skip the onboarding age gate (F2.2).
 */
const APPLE_WEB_ERROR = "/login?error=apple";

function appleIdentity(profile: Record<string, unknown> | undefined): VerifiedIdentity | null {
  const sub = profile?.sub;
  if (typeof sub !== "string" || !sub) return null;
  const rawEmail = profile?.email;
  const email =
    typeof rawEmail === "string" && rawEmail.trim().length > 0 && rawEmail.trim().length <= 254
      ? rawEmail.trim().toLowerCase()
      : null;
  const ev = profile?.email_verified;
  return { sub, email: email && email.includes("@") ? email : null, emailVerified: ev === true || ev === "true" };
}

/** The config is a FUNCTION (Auth.js resolves it per request) so the Apple
 *  `client_secret` can be minted asynchronously; `appleWebClientSecret`
 *  caches it, so this costs nothing on the requests that don't sign in. */
async function authConfig(): Promise<NextAuthConfig> {
  const providers: NextAuthConfig["providers"] = [otpProvider];
  const clientId = appleWebClientId();
  const clientSecret = appleWebSignInEnabled() ? await appleWebClientSecret() : null;
  if (clientId && clientSecret) providers.push(Apple({ clientId, clientSecret }));
  return { ...baseConfig, providers };
}

const otpProvider = Credentials({
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
});

const baseConfig: Omit<NextAuthConfig, "providers"> = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  // Every Auth.js error (a refused Apple callback among them) lands on the
  // login screen with `?error=…`, which it states in words — never Auth.js's
  // own error page.
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "apple") return true;
      const identity = appleIdentity(profile as Record<string, unknown> | undefined);
      if (!identity) return APPLE_WEB_ERROR;
      const kuraAccount = await signInWithIdentity("apple", identity);
      if (!kuraAccount) return APPLE_WEB_ERROR;
      const refreshToken = account.refresh_token;
      if (typeof refreshToken === "string" && refreshToken) {
        afterResponse("auth/apple web refresh token", () =>
          saveAppleRefreshToken(identity.sub, refreshToken),
        );
      }
      console.log(`[auth/apple] web sign-in ${JSON.stringify({ userId: kuraAccount.id })}`);
      return true;
    },
    // `user`/`account` are only present on the sign-in request; afterwards
    // the token keeps the `sub` and `tv` it was minted with.
    async jwt({ token, user, account }) {
      if (account?.provider === "apple") {
        // Auth.js put Apple's `sub` in `token.sub`; the cookie must carry OURS.
        const kuraId = await linkOwner("apple", account.providerAccountId);
        if (!kuraId) throw new Error("[auth/apple] web sign-in without an account row");
        token.sub = kuraId;
        token.tv = await readTokenVersion(kuraId);
        return token;
      }
      if (user) token.tv = typeof user.tv === "number" ? user.tv : 0;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.tv = typeof token.tv === "number" ? token.tv : 0;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
