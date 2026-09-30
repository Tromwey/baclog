import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { googleNonceRequiredAudiences, sha256Hex, verifyGoogleIdToken } from "./social-tokens";

// Run: pnpm tsx --test src/modules/push/liveness.test.ts src/auth/social-tokens.test.ts

const CLIENT_ID = "1234-test.apps.googleusercontent.com";
/** The "Web application" client Android's Credential Manager uses as
 *  `serverClientId`: its ID tokens carry `aud` = this id. */
const WEB_CLIENT_ID = "1234-web.apps.googleusercontent.com";
const KID = "test-key";

// Hermetic: the default `nonceRequiredAudiences` reads GOOGLE_WEB_CLIENT_ID;
// tests that exercise it pass the list explicitly (or set the var themselves).
delete process.env.GOOGLE_WEB_CLIENT_ID;

async function fixture(): Promise<{
  keys: JWTVerifyGetKey;
  sign: (claims: Record<string, unknown>, aud?: string | string[]) => Promise<string>;
}> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, aud: string | string[] = CLIENT_ID) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: "Ana@Example.com", email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuer("https://accounts.google.com")
      .setAudience(aud)
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

test("raw nonce in the body whose sha256hex is the claim → accepted", async () => {
  const { keys, sign } = await fx;
  const raw = "n-123";
  const id = await verifyGoogleIdToken(await sign({ nonce: sha256Hex(raw) }), CLIENT_ID, raw, keys);
  assert.equal(id?.sub, "google-sub-1");
  // Encoding pinned: lowercase hex of SHA-256 (what the iOS app must hand Google).
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("replaying the claim itself as the body nonce → null (a stolen token reveals only the hash)", async () => {
  const { keys, sign } = await fx;
  const claim = sha256Hex("n-123");
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: claim }), CLIENT_ID, claim, keys), null);
});

test("raw nonce in the body but mismatched, absent or non-string claim → null (same as an invalid token)", async () => {
  const { keys, sign } = await fx;
  const h = sha256Hex("n-123");
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: h }), CLIENT_ID, "n-124", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: h.toUpperCase() }), CLIENT_ID, "n-123", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}), CLIENT_ID, "n-123", keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: 123 }), CLIENT_ID, "123", keys), null);
});

test("the existing checks still hold with a matching nonce", async () => {
  const { keys, sign } = await fx;
  assert.equal(
    await verifyGoogleIdToken(await sign({ nonce: sha256Hex("n"), email_verified: false }), CLIENT_ID, "n", keys),
    null,
  );
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: sha256Hex("n") }), "other-client", "n", keys), null);
  assert.equal(await verifyGoogleIdToken("not.a.jwt", CLIENT_ID, "n", keys), null);
});

test("aud: the iOS client id and the web client id (Android) are both accepted when both are configured", async () => {
  const { keys, sign } = await fx;
  const both = [CLIENT_ID, WEB_CLIENT_ID];
  assert.equal((await verifyGoogleIdToken(await sign({}), both, undefined, keys))?.sub, "google-sub-1");
  // Android + nonce: same scheme (the app hands `setNonce(sha256hex(raw))`).
  const androidNonce = await sign({ nonce: sha256Hex("raw-a"), azp: "1234-android.apps.googleusercontent.com" }, WEB_CLIENT_ID);
  assert.equal((await verifyGoogleIdToken(androidNonce, both, "raw-a", keys, [WEB_CLIENT_ID]))?.sub, "google-sub-1");
});

test("nonce: aud web (Android) without nonce in the body → null (Android always sends it; no legacy to spare)", async () => {
  const { keys, sign } = await fx;
  const both = [CLIENT_ID, WEB_CLIENT_ID];
  assert.equal(await verifyGoogleIdToken(await sign({}, WEB_CLIENT_ID), both, undefined, keys, [WEB_CLIENT_ID]), null);
  // Even when the token carries a claim: without the raw value there is no proof.
  const withClaim = await sign({ nonce: sha256Hex("raw-a") }, WEB_CLIENT_ID);
  assert.equal(await verifyGoogleIdToken(withClaim, both, undefined, keys, [WEB_CLIENT_ID]), null);
  // Fail closed: a multi-aud token that names the web client needs it too.
  assert.equal(await verifyGoogleIdToken(await sign({}, [CLIENT_ID, WEB_CLIENT_ID]), both, undefined, keys, [WEB_CLIENT_ID]), null);
});

test("nonce: aud web with the correct raw nonce → identity", async () => {
  const { keys, sign } = await fx;
  const token = await sign({ nonce: sha256Hex("raw-w") }, WEB_CLIENT_ID);
  assert.deepEqual(await verifyGoogleIdToken(token, [CLIENT_ID, WEB_CLIENT_ID], "raw-w", keys, [WEB_CLIENT_ID]), {
    sub: "google-sub-1",
    email: "ana@example.com",
    emailVerified: true,
  });
});

test("nonce: aud web with a wrong raw nonce (or the claim replayed as the raw value) → null", async () => {
  const { keys, sign } = await fx;
  const claim = sha256Hex("raw-w");
  const token = await sign({ nonce: claim }, WEB_CLIENT_ID);
  assert.equal(await verifyGoogleIdToken(token, [WEB_CLIENT_ID], "raw-x", keys, [WEB_CLIENT_ID]), null);
  assert.equal(await verifyGoogleIdToken(token, [WEB_CLIENT_ID], claim, keys, [WEB_CLIENT_ID]), null);
});

test("nonce: aud iOS without nonce in the body → still accepted (legacy iOS builds, accepted risk)", async () => {
  const { keys, sign } = await fx;
  const both = [CLIENT_ID, WEB_CLIENT_ID];
  assert.equal((await verifyGoogleIdToken(await sign({}), both, undefined, keys, [WEB_CLIENT_ID]))?.sub, "google-sub-1");
  // …but a raw nonce that is sent is still enforced for iOS.
  assert.equal(await verifyGoogleIdToken(await sign({ nonce: sha256Hex("a") }), both, "b", keys, [WEB_CLIENT_ID]), null);
});

test("nonce: the default required list is GOOGLE_WEB_CLIENT_ID (trimmed), empty when unset", async () => {
  const { keys, sign } = await fx;
  assert.deepEqual(googleNonceRequiredAudiences(), []);
  process.env.GOOGLE_WEB_CLIENT_ID = `  ${WEB_CLIENT_ID} `;
  try {
    assert.deepEqual(googleNonceRequiredAudiences(), [WEB_CLIENT_ID]);
    // No 5th argument = the routes' call: the env default applies.
    assert.equal(await verifyGoogleIdToken(await sign({}, WEB_CLIENT_ID), [CLIENT_ID, WEB_CLIENT_ID], undefined, keys), null);
    assert.equal((await verifyGoogleIdToken(await sign({}), [CLIENT_ID, WEB_CLIENT_ID], undefined, keys))?.sub, "google-sub-1");
  } finally {
    delete process.env.GOOGLE_WEB_CLIENT_ID;
  }
});

test("aud: only the configured ids count — a web-client token with only the iOS id configured (and vice versa) → null", async () => {
  const { keys, sign } = await fx;
  assert.equal(await verifyGoogleIdToken(await sign({}, WEB_CLIENT_ID), [CLIENT_ID], undefined, keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}), [WEB_CLIENT_ID], undefined, keys), null);
  assert.equal((await verifyGoogleIdToken(await sign({}, WEB_CLIENT_ID), [WEB_CLIENT_ID], undefined, keys))?.sub, "google-sub-1");
});

test("aud: a foreign client id → null (the route's 401), also inside a multi-aud token", async () => {
  const { keys, sign } = await fx;
  const both = [CLIENT_ID, WEB_CLIENT_ID];
  assert.equal(await verifyGoogleIdToken(await sign({}, "999-other.apps.googleusercontent.com"), both, undefined, keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}, []), both, undefined, keys), null);
  // A token minted for several audiences is ours if ONE of them is (RFC 7519 §4.1.3).
  assert.equal(
    (await verifyGoogleIdToken(await sign({}, ["999-other", WEB_CLIENT_ID]), both, undefined, keys))?.sub,
    "google-sub-1",
  );
});

test("aud: no configured client (empty list, or only blanks) → null, never 'no audience check'", async () => {
  const { keys, sign } = await fx;
  assert.equal(await verifyGoogleIdToken(await sign({}), [], undefined, keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}), [""], undefined, keys), null);
  assert.equal(await verifyGoogleIdToken(await sign({}), "", undefined, keys), null);
});
