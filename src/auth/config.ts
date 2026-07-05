import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyOtp } from "./otp";

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
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "otp",
      name: "Email code",
      credentials: { email: {}, code: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const code = String(credentials?.code ?? "");
        if (!email || !code) return null;
        const user = await verifyOtp(email, code);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
