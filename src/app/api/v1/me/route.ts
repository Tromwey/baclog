import { assertUser } from "@/authz";
import { withApi } from "@/authz/api";
import { json } from "../_lib/http";
import { buildMe } from "../_lib/me";

/**
 * GET /api/v1/me → Me (§4 Cuenta). `PATCH` arrives with phase 2.
 *
 * Resolves the user through `assertUser()` on purpose — the same choke point
 * server actions use — to exercise the `apiContext` bridge on every call:
 * if the AsyncLocalStorage hand-off ever broke, this endpoint would 401
 * instead of silently reading a cookie.
 */
export const GET = withApi(async () => {
  const user = await assertUser();
  return json(await buildMe(user));
});
