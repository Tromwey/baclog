import { verifyMergeOtp } from "@/auth/otp";
import { withApi } from "@/authz/api";
import { json, readJson } from "../../../../_lib/http";
import { invalidProof, mergeProofFor } from "../../../../_lib/merge";
import { MergeOtpVerifyBodySchema } from "../../../../_lib/schemas";

/**
 * POST /api/v1/me/merge/otp/verify { email, code } → 200 { mergeToken, source }
 * (phase 4g). ONE 422 `invalid` + reason `invalid_proof` (same message) for
 * everything that isn't a live code for an existing other account — wrong,
 * expired, burned (5 attempts), decoy, or no account with that email — so
 * the mailbox check is the only thing that reveals existence, and even then
 * a missing account reads like a wrong code. Not 401: the bearer is valid
 * and the app signs out on any 401 (401 stays for a bad bearer only).
 */
export const POST = withApi(async (request, { user }) => {
  const { email, code } = await readJson(request, MergeOtpVerifyBodySchema);
  const sourceId = await verifyMergeOtp(user.id, email, code);
  if (!sourceId) {
    throw invalidProof("El código no es válido o ya venció. Pide uno nuevo.");
  }
  return json(await mergeProofFor(user.id, sourceId));
});
