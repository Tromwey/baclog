import { test } from "node:test";
import assert from "node:assert/strict";
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from "jose";
import {
  FCM_SCOPE,
  fcmConfig,
  fcmData,
  fcmRequestBody,
  isDeadFcmToken,
  isFcmAuthError,
  mintFcmAccessToken,
  sendFcm,
} from "./fcm-transport";

// Run: pnpm tsx --test src/modules/push/fcm-transport.test.ts

const keys = (async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  return { pkcs8: await exportPKCS8(privateKey), spki: await exportSPKI(publicKey) };
})();

async function account(extra: Record<string, unknown> = {}) {
  return {
    type: "service_account",
    project_id: "kura-test",
    private_key_id: "kid-1",
    private_key: (await keys).pkcs8,
    client_email: "push@kura-test.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
    ...extra,
  };
}

test("fcmConfig: absent, junk or incomplete → null (push degrades to a logged no-op)", async () => {
  assert.equal(fcmConfig({}), null);
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: "  " }), null);
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: "{not json" }), null);
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(await account({ project_id: "" })) }), null);
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(await account({ private_key: "nope!" })) }), null);
});

test("fcmConfig: plain, single-quoted, string-encoded and escaped-newline pastes all parse", async () => {
  const plain = JSON.stringify(await account());
  const cfg = fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: plain });
  assert.ok(cfg);
  assert.equal(cfg.projectId, "kura-test");
  assert.equal(cfg.clientEmail, "push@kura-test.iam.gserviceaccount.com");
  assert.equal(cfg.privateKeyId, "kid-1");
  assert.match(cfg.privateKeyPem, /^-----BEGIN PRIVATE KEY-----\n/);
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: `'${plain}'` })?.projectId, "kura-test");
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(plain) })?.projectId, "kura-test");
  // The key's newlines double-escaped (a UI that stored `\\n` literally).
  const doubled = plain.replace(/\\n/g, "\\\\n");
  assert.equal(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: doubled })?.privateKeyPem, cfg.privateKeyPem);
});

test("mintFcmAccessToken: RS256 assertion (iss = sub = client_email, scope, aud = token_uri) → access token + expiry", async () => {
  const cfg = fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(await account()) })!;
  const pub = await importSPKI((await keys).spki, "RS256");
  let seen: URLSearchParams | null = null;
  const fake: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    seen = new URLSearchParams(String(init?.body));
    return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3599, token_type: "Bearer" }), { status: 200 });
  };
  const now = 1_790_000_000_000;
  const minted = await mintFcmAccessToken(cfg, now, fake);
  assert.deepEqual(minted, { token: "ya29.test", expiresAt: now + 3599 * 1000 });
  assert.ok(seen);
  const params = seen as URLSearchParams;
  assert.equal(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const { payload, protectedHeader } = await jwtVerify(params.get("assertion")!, pub, {
    audience: "https://oauth2.googleapis.com/token",
    issuer: cfg.clientEmail,
    currentDate: new Date(now),
  });
  assert.equal(protectedHeader.alg, "RS256");
  assert.equal(protectedHeader.kid, "kid-1");
  assert.equal(payload.sub, cfg.clientEmail);
  assert.equal(payload.scope, FCM_SCOPE);
  assert.equal(payload.exp! - payload.iat!, 3600);
});

test("mintFcmAccessToken: Google refuses → throws (the caller logs and counts, never sends)", async () => {
  const cfg = fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(await account()) })!;
  const fake: typeof fetch = async () => new Response('{"error":"invalid_grant"}', { status: 400 });
  await assert.rejects(mintFcmAccessToken(cfg, Date.now(), fake), /400/);
});

test("fcmRequestBody: token, notification, data as strings, android high priority", () => {
  const body = JSON.parse(
    fcmRequestBody("tok:en", { title: "Dune ya salió ✦", body: "Hoy sale Dune.", data: { type: "release", titleId: "abc", n: 3, gone: null } }),
  );
  assert.deepEqual(body, {
    message: {
      token: "tok:en",
      notification: { title: "Dune ya salió ✦", body: "Hoy sale Dune." },
      data: { type: "release", titleId: "abc", n: "3" },
      android: { priority: "high" },
    },
  });
  const titleOnly = JSON.parse(fcmRequestBody("t", { title: "@ana te sigue", data: { type: "follower", handle: "ana" } }, true));
  assert.equal(titleOnly.validate_only, true);
  assert.deepEqual(titleOnly.message.notification, { title: "@ana te sigue" });
  assert.deepEqual(fcmData({ a: { b: 1 } }), { a: '{"b":1}' });
});

test("sendFcm: 200 / 404 / UNREGISTERED / INVALID_ARGUMENT / 401 / network error, in order, never throws", async () => {
  const fcmError = (status: number, rpc: string, errorCode?: string) =>
    new Response(
      JSON.stringify({
        error: {
          code: status,
          status: rpc,
          message: "x",
          details: errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : [],
        },
      }),
      { status },
    );
  const byToken: Record<string, () => Response> = {
    ok: () => new Response('{"name":"projects/kura-test/messages/1"}', { status: 200 }),
    gone: () => fcmError(404, "NOT_FOUND", "UNREGISTERED"),
    unreg: () => fcmError(400, "INVALID_ARGUMENT", "UNREGISTERED"),
    bad: () => fcmError(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT"),
    auth: () => fcmError(401, "UNAUTHENTICATED"),
  };
  const urls = new Set<string>();
  const fake: typeof fetch = async (url, init) => {
    urls.add(String(url));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer ya29.x");
    const token = JSON.parse(String(init?.body)).message.token as string;
    if (token === "down") throw new TypeError("fetch failed");
    return byToken[token]();
  };
  const msg = { title: "t", data: { type: "follower" } };
  const tokens = ["ok", "gone", "unreg", "bad", "auth", "down"];
  const results = await sendFcm(tokens.map((token) => ({ token, message: msg })), { projectId: "kura-test" }, "ya29.x", { fetchImpl: fake });
  assert.deepEqual([...urls], ["https://fcm.googleapis.com/v1/projects/kura-test/messages:send"]);
  assert.deepEqual(
    results.map((r) => [r.token, r.status, r.errorCode]),
    [
      ["ok", 200, null],
      ["gone", 404, "UNREGISTERED"],
      ["unreg", 400, "UNREGISTERED"],
      ["bad", 400, "INVALID_ARGUMENT"],
      ["auth", 401, "UNAUTHENTICATED"],
      ["down", 0, "fetch failed"],
    ],
  );
  assert.deepEqual(results.map(isDeadFcmToken), [false, true, true, false, false, false]);
  assert.deepEqual(results.map(isFcmAuthError), [false, false, false, false, true, false]);
});
