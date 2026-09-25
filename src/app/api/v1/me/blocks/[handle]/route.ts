import { ApiError, withApi } from "@/authz/api";
import { blockUser, unblockUser } from "@/modules/social/block";
import { noContent } from "../../../_lib/http";

const NOT_FOUND_MSG = "No encontramos ese perfil. Puede que sea privado o que ya no exista.";

/** Every 404 of this route carries the SAME body (learning 2026-09-24
 *  404-idéntico-con-mensaje-distinto): malformed, nonexistent and own handle
 *  must not read differently. */
function notFound(): never {
  throw new ApiError("not_found", NOT_FOUND_MSG);
}

function refOf(raw: string | string[] | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) notFound();
  return raw;
}

/**
 * PUT /api/v1/me/blocks/{handle} → 204 (App Store 1.2). Blocks the account
 * at `handle`, public or private. Nonexistent, malformed and your OWN handle
 * are one identical 404. Idempotent. In the same transaction it deletes the
 * follow edges in BOTH directions; from then on the block is mutual in
 * visibility (`modules/social/block-gate.ts`) and following either way is a
 * 404. Rules in `modules/social/block.ts`.
 */
export const PUT = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await blockUser(user.id, refOf(params.handle));
  if ("error" in result) notFound();
  return noContent();
});

/**
 * DELETE /api/v1/me/blocks/{handle | id} → 204, idempotent. Accepts a handle
 * OR the opaque `id` from `GET /me/blocks` (the only way back for a row whose
 * handle is null). Unknown handle, unknown id and "wasn't blocked" are all
 * 204 — it only ever deletes the caller's own row. A ref that is neither a
 * UUID nor a possible handle is the same 404 as PUT's.
 */
export const DELETE = withApi<{ handle: string }>(async (_request, { user, params }) => {
  const result = await unblockUser(user.id, refOf(params.handle));
  if ("error" in result) notFound();
  return noContent();
});
