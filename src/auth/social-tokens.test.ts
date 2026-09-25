import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { verifyGoogleIdToken } from "./social-tokens";

// Run: pnpm tsx --test src/modules/push/liveness.test.ts src/auth/social-tokens.test.ts

const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const KID = "test-key";

async function fixture(): Promise<{
  keys: JWTVerifyGetKey;
  sign: (claims: Record<string, unknown>) => Promise<string>;
}> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: "Ana@Example.com", email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setSubject("google-sub-1")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(privateKey);
  };
  return { keys, sign };
}

const fx = fixture();

test("no nonce in the body → accepted with or without the claim (old builds)", async () => {
  const { keys, sign } = await fx;
  const plain = await verifyGoogleIdToken(await sign({}), CLIENT_ID, undefined, keys);
  assert.deepEqual(plain, { sub: "google-sub-1", email: "ana@example.com", emailVerified: true });
  const withClaim = await verifyGoogleIdToken(await sign({ nonce: "abc" }), CLIENT_ID, undefined, keys);
  assert.equal(withClaim?.sub, "google-sub-1");
});

test("nonce in the body matching the claim → accepted", async () => {
  const { keys, sign } = await fx;
  const id = await verifyGoogleIdToken(await sign({ nonce: "n-123" }), CLIENT_ID, "n-123", keys);
  assert.equal(id?.sub, "google-sub-1");
});

test("nonce in the body but mismatched, absent or non-string claim → null (same as an invalid token)", async () => {
  const { keys, sign } = await fx;
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: "n-123" }), CLIENT_ID, "n-124", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: "n-12" }), CLIENT_ID, "n-123", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}), CLIENT_ID, "n-123", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: 123 }), CLIENT_ID, "123", keys), null);
});

test("the existing checks still hold with a matching nonce", async () => {
  const { keys, sign } = await fx;
  assert.equal(
    await verifyGoogleIdToken(await sign({ nonce: "n", email_verified: false }), CLIENT_ID, "n", keys),
    null,
  );
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: "n" }), "other-client", "n", keys), null);
  assert.equal(await verifyGoogleIdToken("not.a.jwt", CLIENT_ID, "n", keys), null);
});
