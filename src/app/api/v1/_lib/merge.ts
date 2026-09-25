import "server-only";
import { ApiError } from "@/authz/api";
import { issueMergeToken } from "@/authz/merge-token";
import { getMergeSource } from "@/modules/account/merge";
import type { MergeProof } from "./schemas";

/** The ONE copy of a rejected mergeToken (expired, used, foreign, forged,
 *  or its source gone) — `POST /me/merge` never says which. 409, not 401:
 *  the bearer is fine, only the ticket is not (a 401 would log the app out). */
export const MERGE_TOKEN_INVALID_MESSAGE =
  "El permiso para fusionar venció o ya se usó. Vuelve a confirmar la otra cuenta.";

/**
 * A rejected ownership PROOF on an authenticated route — bad/expired/forged
 * provider token (`POST /me/identities/{provider}`) or wrong/expired/burned
 * merge code (`POST /me/merge/otp/verify`): 422 `invalid` + reason
 * `invalid_proof`, ONE message per endpoint whatever the cause (no oracle).
 * Never 401: the bearer is fine, and the app signs out on any 401.
 */
export function invalidProof(message: string): ApiError {
  return new ApiError("invalid", message, { reason: "invalid_proof", status: 422 });
}

export function mergeTokenInvalid(): ApiError {
  return new ApiError("conflict", MERGE_TOKEN_INVALID_MESSAGE, { reason: "merge_token_invalid" });
}

/**
 * `{ mergeToken, source }` once the caller PROVED it owns `sourceId` (a
 * provider token that belongs to it, or its mailed merge code). The source
 * summary is read first: a source that vanished in between is the same
 * "prove it again" conflict, and no token is minted for it.
 */
export async function mergeProofFor(destinationId: string, sourceId: string): Promise<MergeProof> {
  const source = await getMergeSource(sourceId);
  if (!source) throw mergeTokenInvalid();
  const mergeToken = await issueMergeToken(destinationId, sourceId);
  return { mergeToken, source };
}
