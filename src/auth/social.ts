import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { KURA_BUNDLE_ID, appleKeyConfig, signAppleClientSecret } from "./apple-key";
import { findOrCreateUserByVerifiedEmail } from "./otp";
import type { VerifiedIdentity } from "./social-tokens";

/**
 * Phase 4f — Sign in with Apple / Google for the iOS app, on top of the
 * Auth.js adapter's `account` table (`provider`, `provider_account_id` =
 * the provider's `sub`). The identity token was already verified
 * (`social-tokens.ts`); this file decides WHICH Kura account it is:
 *
 *   1. An `account` row for (provider, sub) → that user.
 *   2. Else, a VERIFIED email in the token → the account with that email
 *      (linked — accepted risk in state/security.md) or a new one (same
 *      creation path as OTP: `findOrCreateUserByVerifiedEmail`), and the
 *      `account` row is inserted so the next sign-in takes path 1 even if
 *      the email later changes or is hidden.
 *   3. Else → null (the route's 401): no email to create or link by.
 *
 * The Kura account's own email NEVER changes because of a provider: a linked
 * account keeps the address it was created with.
 */

export type SocialProvider = "apple" | "google";

const SIGNIN_COLUMNS = { id: users.id, isMinor: users.isMinor };

export async function signInWithIdentity(
  provider: SocialProvider,
  identity: VerifiedIdentity,
): Promise<{ id: string; isMinor: boolean } | null> {
  const [linked] = await db
    .select(SIGNIN_COLUMNS)
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, identity.sub)))
    .limit(1);
  if (linked) return linked;

  if (!identity.email || !identity.emailVerified) return null;
  const user = await findOrCreateUserByVerifiedEmail(identity.email);
  // (provider, sub) is the PK: a concurrent first sign-in inserts once, and
  // the loser re-reads whichever user won.
  await db
    .insert(accounts)
    .values({
      userId: user.id,
      type: "oidc",
      provider,
      providerAccountId: identity.sub,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select(SIGNIN_COLUMNS)
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, identity.sub)))
    .limit(1);
  return row ?? null;
}

// ---------- phase 4g: link a provider to the SIGNED-IN account ----------

export type LinkOutcome =
  /** The identity is (now) linked to `userId` — inserted or already there. */
  | { kind: "linked" }
  /** The identity belongs to ANOTHER Kura account: by its `account` link,
   *  or (no link) because its verified email is that account's email — the
   *  account this provider would sign into today. The provider token just
   *  proved ownership of it: the caller mints a mergeToken. */
  | { kind: "elsewhere"; ownerId: string }
  /** `userId` already has a DIFFERENT identity of this provider. */
  | { kind: "provider_already_linked" };

async function linkOwner(provider: SocialProvider, sub: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, sub)))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * `POST /api/v1/me/identities/{provider}` — attach a VERIFIED provider
 * identity to `userId` (the bearer's account, never a body field), in the
 * contract's order: link of this `sub` (mine → linked, other → elsewhere);
 * else a verified email that is ANOTHER account's → link it to THAT account
 * (as sign-in would) and → elsewhere; else this
 * user already has another `sub` of the provider → provider_already_linked;
 * else insert. The insert races on the (provider, sub) PK: the loser re-reads
 * the owner. Never changes any account's email.
 */
export async function linkIdentity(
  userId: string,
  provider: SocialProvider,
  identity: VerifiedIdentity,
): Promise<LinkOutcome> {
  const owner = await linkOwner(provider, identity.sub);
  if (owner) return owner === userId ? { kind: "linked" } : { kind: "elsewhere", ownerId: owner };

  if (identity.email && identity.emailVerified) {
    const [byEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, identity.email))
      .limit(1);
    if (byEmail && byEmail.id !== userId) {
      // Link the identity to THAT account — the same trust
      // `signInWithIdentity` gives a verified email — so the link travels to
      // the caller with the merge instead of being lost. A concurrent link
      // wins the PK; the re-read says whose it is.
      await db
        .insert(accounts)
        .values({ userId: byEmail.id, type: "oidc", provider, providerAccountId: identity.sub })
        .onConflictDoNothing();
      const owner = await linkOwner(provider, identity.sub);
      if (owner === userId) return { kind: "linked" };
      return { kind: "elsewhere", ownerId: owner ?? byEmail.id };
    }
  }

  const [mine] = await db
    .select({ one: accounts.provider })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
    .limit(1);
  if (mine) return { kind: "provider_already_linked" };

  await db
    .insert(accounts)
    .values({ userId, type: "oidc", provider, providerAccountId: identity.sub })
    .onConflictDoNothing();
  const winner = await linkOwner(provider, identity.sub);
  if (winner === userId) return { kind: "linked" };
  if (winner) return { kind: "elsewhere", ownerId: winner };
  throw new Error("linkIdentity: account row vanished after insert");
}

/** Which providers `userId` has linked (`GET /me/identities`). */
export async function linkedProviders(userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  return new Set(rows.map((r) => r.provider));
}

/** Apple "Hide My Email" relay domain. */
const APPLE_RELAY_SUFFIX = "@privaterelay.appleid.com";

export function isAppleRelayEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(APPLE_RELAY_SUFFIX);
}

/**
 * Unlinking Apple from an account whose ONLY other way in is an Apple relay
 * address would likely lock it out: once the Apple link is revoked the relay
 * may stop forwarding, so the login code never arrives. True = refuse
 * (`409 last_way_in`): relay email AND no link of another provider.
 */
export async function appleIsLastWayIn(userId: string, email: string): Promise<boolean> {
  if (!isAppleRelayEmail(email)) return false;
  const providers = await linkedProviders(userId);
  return ![...providers].some((p) => p !== "apple");
}

/**
 * `DELETE /api/v1/me/identities/{provider}` — drop every `account` row of
 * that provider for `userId`. For Apple, the refresh tokens are read FIRST
 * and the returned function revokes them (the caller schedules it after the
 * response: best-effort, like `deleteAccount`). Always allowed: the account's
 * email stays a way in.
 */
export async function unlinkProvider(
  userId: string,
  provider: SocialProvider,
): Promise<() => Promise<void>> {
  const revoke = provider === "apple" ? await prepareAppleRevocation(userId) : async () => {};
  await db
    .delete(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)));
  return revoke;
}

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_HTTP_TIMEOUT_MS = 8000;

/**
 * Exchange a Sign in with Apple `authorizationCode` for a refresh token and
 * keep it on the `account` row — the ONLY way to later revoke the Apple link
 * when the Kura account is deleted (App Store 5.1.1(v)). Best-effort: runs
 * after the response (`afterResponse`), logs and returns on any failure
 * (no key configured, Apple down, code already used). Never logs the code or
 * the token.
 */
export async function storeAppleRefreshToken(
  appleSub: string,
  authorizationCode: string,
): Promise<void> {
  const cfg = appleKeyConfig();
  if (!cfg) {
    console.log("[auth/apple] sin APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY: no se intercambia el código (no habrá refresh token para revocar)");
    return;
  }
  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: KURA_BUNDLE_ID,
      client_secret: await signAppleClientSecret(cfg),
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Apple's error body is `{ error: "invalid_grant" }`-shaped: no secrets.
    console.error(`[auth/apple] intercambio de código falló: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const body = (await res.json()) as { refresh_token?: unknown };
  if (typeof body.refresh_token !== "string" || !body.refresh_token) {
    console.error("[auth/apple] intercambio sin refresh_token");
    return;
  }
  await db
    .update(accounts)
    .set({ refresh_token: body.refresh_token })
    .where(and(eq(accounts.provider, "apple"), eq(accounts.providerAccountId, appleSub)));
}

/** The Apple refresh tokens of `userId` (0 or 1 in practice) — read BEFORE
 *  the account is deleted, since the `account` rows cascade with it. */
export async function appleRefreshTokensOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ token: accounts.refresh_token })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "apple"),
        isNotNull(accounts.refresh_token),
      ),
    );
  return rows.map((r) => r.token).filter((t): t is string => !!t);
}

/** Whether `userId` has an Apple link at all (for the "no token to revoke"
 *  log line). */
async function hasAppleLink(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: accounts.provider })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "apple")))
    .limit(1);
  return !!row;
}

/**
 * Revoke Apple refresh tokens (App Store 5.1.1(v): deleting the account must
 * revoke the Sign in with Apple link). Best-effort per token: a failure is
 * logged, never thrown — it must NEVER block or undo an account deletion.
 */
export async function revokeAppleTokens(userId: string, tokens: string[]): Promise<void> {
  const cfg = appleKeyConfig();
  if (!cfg) {
    if (tokens.length > 0) {
      console.error(`[auth/apple] no se pudo revocar Apple para ${userId}: faltan APPLE_* en el entorno`);
    }
    return;
  }
  for (const token of tokens) {
    try {
      const res = await fetch(APPLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: KURA_BUNDLE_ID,
          client_secret: await signAppleClientSecret(cfg),
          token,
          token_type_hint: "refresh_token",
        }),
        signal: AbortSignal.timeout(APPLE_HTTP_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`[auth/apple] revocación falló para ${userId}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      } else {
        console.log(`[auth/apple] vínculo de Apple revocado para ${userId}`);
      }
    } catch (err) {
      console.error(`[auth/apple] revocación falló para ${userId}:`, err);
    }
  }
}

/**
 * What `deleteAccount` calls BEFORE deleting: collects what revocation needs
 * (the tokens die with the `account` rows) and returns the revocation to run
 * once the rows are gone. Never throws: a failed read is logged and the
 * deletion goes ahead (revocation is best-effort by contract).
 */
export async function prepareAppleRevocation(userId: string): Promise<() => Promise<void>> {
  try {
    const tokens = await appleRefreshTokensOf(userId);
    if (tokens.length === 0) {
      if (await hasAppleLink(userId)) {
        console.error(`[auth/apple] ${userId} tiene vínculo de Apple sin refresh token: no hay nada que revocar`);
      }
      return async () => {};
    }
    return () => revokeAppleTokens(userId, tokens);
  } catch (err) {
    console.error(`[auth/apple] no se pudo leer el vínculo de Apple de ${userId}:`, err);
    return async () => {};
  }
}

