import {
  MOBILE_TOKEN_REFRESH_WINDOW_SECONDS,
  issueMobileToken,
  withApi,
} from "@/authz/api";
import { json } from "../../_lib/http";
import { buildMe } from "../../_lib/me";
import type { AuthSession } from "../../_lib/schemas";

/**
 * POST /api/v1/auth/refresh (bearer) → { token, user: Me } (§2.1).
 *
 * Rotation happens ONLY inside the token's last 7 days
 * (`MOBILE_TOKEN_REFRESH_WINDOW_SECONDS`): then the caller gets a fresh
 * 30-day token with a new `jti`. Earlier, the SAME token comes back (with
 * the same fresh `Me`) — the app calls this on every launch, and minting a
 * new 30-day token each time would keep an unbounded number of them alive.
 * The old token stays valid until its own `exp` either way: there is no
 * per-token revocation until phase 4 (see src/authz/api.ts).
 */
export const POST = withApi(async (_request, { user, bearer }) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = bearer.claims.exp - now;
  const token =
    remaining < MOBILE_TOKEN_REFRESH_WINDOW_SECONDS
      ? await issueMobileToken(user.id)
      : bearer.token;
  const body: AuthSession = { token, user: await buildMe(user) };
  return json(body);
});
