import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, like, lt } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { MERGE_TOKEN_IDENTIFIER_PREFIX } from "@/auth/otp";
import { secretKey } from "./keys";

/**
 * Phase 4g — the "you proved you own the other account" ticket.
 *
 *   HS256 (AUTH_SECRET, `keys.ts`) · aud = "kura-merge" · sub = destination
 *   (the bearer's account) · src = source (the account to absorb) · jti ·
 *   exp = +10 min
 *
 * Minted ONLY after one of the three ownership proofs (a provider token that
 * belongs to the other account — by link or by verified email —, or the
 * merge code mailed to it) and consumed by `POST /api/v1/me/merge`. Single
 * use without a new table, the handoff pattern (`handoff.ts`): the mint
 * writes `verificationToken(identifier = "merge-token:" + jti, token = jti)`
 * and the consume is `DELETE … RETURNING` — two concurrent merges with the
 * same token race on one row and exactly one wins. The login OTP never reads
 * that namespace (`verifyOtp` refuses it). The audience keeps it from ever
 * being accepted as a bearer (`kura-ios`) or a handoff (`kura-web-handoff`),
 * and vice versa.
 */
export const MERGE_TOKEN_AUDIENCE = "kura-merge";
export const MERGE_TOKEN_TTL_SECONDS = 10 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function issueMergeToken(destinationId: string, sourceId: string): Promise<string> {
  if (destinationId === sourceId) throw new Error("issueMergeToken: source === destination");
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + MERGE_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ src: sourceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(destinationId)
    .setAudience(MERGE_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(secretKey());
  // Unused tokens that expired: gone, so the shared table never accrues them
  // (the OTP sweep would get them too; this keeps it local and cheap).
  await db
    .delete(verificationTokens)
    .where(
      and(
        like(verificationTokens.identifier, `${MERGE_TOKEN_IDENTIFIER_PREFIX}%`),
        lt(verificationTokens.expires, new Date()),
      ),
    );
  await db.insert(verificationTokens).values({
    identifier: `${MERGE_TOKEN_IDENTIFIER_PREFIX}${jti}`,
    token: jti,
    expires: new Date(exp * 1000),
  });
  return token;
}

/** A burned merge token: who to absorb, and how to un-burn it. */
export interface RedeemedMergeToken {
  sourceId: string;
  /**
   * Puts the single-use row back (same `jti`, same expiry) so the SAME token
   * works again until its original `exp`. For ONE case: the merge did not
   * happen because something transient failed (the database, the network) —
   * not for a refusal (`MergeRaceError`, underage, source gone), where the
   * proof must be given again. Without it a hiccup between "token burned"
   * and "accounts merged" cost the user a whole new code by mail. Idempotent
   * (`onConflictDoNothing`) and it never extends the token's life.
   */
  restore(): Promise<void>;
}

/**
 * Verify + BURN a merge token for `destinationId` (the bearer's user).
 * Returns the source id (and a `restore`), or null on ANY failure — bad
 * signature, other audience, expired, missing claim, `sub` ≠ the caller,
 * `src` = `sub`, already used or never minted. The caller answers one error
 * for all of them. The row is burned only after the claims check out, so a
 * token someone else presents (wrong `sub`) does not kill the owner's
 * ticket. Throws only if the database does.
 *
 * Burn-first on purpose (the merge runs in its own `db.batch`; the DELETE is
 * what makes two concurrent requests with one token race on one row and
 * exactly one proceed). `restore` covers the failure in between.
 */
export async function redeemMergeToken(
  token: string,
  destinationId: string,
): Promise<RedeemedMergeToken | null> {
  if (!token || token.length > 2048) return null;
  let src: string;
  let jti: string;
  let exp: number;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: MERGE_TOKEN_AUDIENCE,
      // Without these a validly signed JWS that OMITS `exp` would never
      // expire (jose only checks `exp` when present).
      requiredClaims: ["exp", "jti", "sub"],
    });
    if (payload.sub !== destinationId) return null;
    if (typeof payload.jti !== "string" || !UUID_RE.test(payload.jti)) return null;
    if (typeof payload.src !== "string" || !payload.src || payload.src === destinationId) {
      return null;
    }
    if (typeof payload.exp !== "number") return null;
    src = payload.src;
    jti = payload.jti;
    exp = payload.exp;
  } catch {
    return null;
  }
  const identifier = `${MERGE_TOKEN_IDENTIFIER_PREFIX}${jti}`;
  const consumed = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, jti),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .returning({ identifier: verificationTokens.identifier });
  if (consumed.length !== 1) return null;
  return {
    sourceId: src,
    restore: async () => {
      await db
        .insert(verificationTokens)
        .values({ identifier, token: jti, expires: new Date(exp * 1000) })
        .onConflictDoNothing();
    },
  };
}
