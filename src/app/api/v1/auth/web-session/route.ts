import { ApiError, withApi } from "@/authz/api";
import { DEFAULT_HANDOFF_TARGET, issueWebHandoff, parseHandoffTarget } from "@/authz/handoff";
import { json, readOptionalJson } from "../../_lib/http";
import { WebSessionBodySchema, type WebSession } from "../../_lib/schemas";

/**
 * POST /api/v1/auth/web-session (bearer) { to? } → { url } (§2.1, phase 4b).
 *
 * `url` = `<origin>/api/auth/handoff?t=<jws>&to=<path>`: opened in an
 * SFSafariViewController it lands on the web ALREADY signed in (Auth.js
 * cookie) — for the screens that only exist on the web, today the recap
 * card exporter. One use, 60 s, bound to this account's current
 * `token_version` (design + threat notes in src/authz/handoff.ts).
 *
 * `to` must be one of the allow-listed paths (`/recap/tarjeta`, `/recap`,
 * optionally with `?mes=YYYY-MM`); anything else — an
 * absolute URL, `//host`, another path — is 400 `invalid` + `fields.to`,
 * never silently replaced. The origin is this request's own: the cookie is
 * set on the host the app already talks to.
 *
 * The version is the bearer's `tv`: `withApi` has just checked it equals
 * the row's, so it IS the current one.
 */
export const POST = withApi(async (request, { user, bearer }) => {
  const body = await readOptionalJson(request, WebSessionBodySchema);
  const to = body.to === undefined ? DEFAULT_HANDOFF_TARGET : parseHandoffTarget(body.to);
  if (!to) {
    throw new ApiError("invalid", undefined, {
      fields: { to: "Ese destino no está permitido." },
    });
  }
  const t = await issueWebHandoff(user.id, bearer.claims.tv);
  const url = new URL("/api/auth/handoff", new URL(request.url).origin);
  url.searchParams.set("t", t);
  url.searchParams.set("to", to);
  const res: WebSession = { url: url.toString() };
  return json(res);
});
