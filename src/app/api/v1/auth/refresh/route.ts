import { issueMobileToken, withApi } from "@/authz/api";
import { json } from "../../_lib/http";
import { buildMe } from "../../_lib/me";
import type { AuthSession } from "../../_lib/schemas";

/**
 * POST /api/v1/auth/refresh (bearer) → { token, user: Me } (§2.1). A valid,
 * unexpired bearer buys a fresh 30-day one with a new `jti`; the old one
 * stays valid until its own `exp` (no session table to revoke it — §2.1).
 */
export const POST = withApi(async (_request, { user }) => {
  const token = await issueMobileToken(user.id);
  const body: AuthSession = { token, user: await buildMe(user) };
  return json(body);
});
