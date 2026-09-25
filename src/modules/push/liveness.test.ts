import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_TOKEN_LIVE_WINDOW_MS, deviceTokenIsLive, type DeviceTokenLiveness } from "./liveness";

// Run: pnpm tsx --test src/modules/push/liveness.test.ts src/auth/social-tokens.test.ts

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const SID = "7f1c6a0e-2b1d-4c9e-9a51-0d7b1c2e3f40";

function row(over: Partial<DeviceTokenLiveness>): DeviceTokenLiveness {
  return {
    sessionId: SID,
    joinedSessionId: SID,
    sessionRevokedAt: null,
    sessionLastSeenAt: new Date(NOW - DAY),
    updatedAt: new Date(NOW - DAY),
    ...over,
  };
}

test("the window is the bearer lifetime (30 days)", () => {
  assert.equal(DEVICE_TOKEN_LIVE_WINDOW_MS, 30 * DAY);
});

test("session live and seen recently → push", () => {
  assert.equal(deviceTokenIsLive(row({}), NOW), true);
});

test("session unseen for longer than the bearer lifetime → no push (the expired-bearer bug)", () => {
  // The token was re-registered recently, but every bearer of its session is dead.
  const r = row({ sessionLastSeenAt: new Date(NOW - 31 * DAY), updatedAt: new Date(NOW - DAY) });
  assert.equal(deviceTokenIsLive(r, NOW), false);
});

test("boundary: seen just inside the window → push; exactly at it → no push", () => {
  assert.equal(deviceTokenIsLive(row({ sessionLastSeenAt: new Date(NOW - 30 * DAY + 1000) }), NOW), true);
  assert.equal(deviceTokenIsLive(row({ sessionLastSeenAt: new Date(NOW - 30 * DAY) }), NOW), false);
});

test("revoked session → no push, however recent", () => {
  const r = row({ sessionRevokedAt: new Date(NOW - 1000), sessionLastSeenAt: new Date(NOW - 1000) });
  assert.equal(deviceTokenIsLive(r, NOW), false);
});

test("session row did not join (gone / another account's) → no push", () => {
  const r = row({ joinedSessionId: null, sessionLastSeenAt: null });
  assert.equal(deviceTokenIsLive(r, NOW), false);
});

test("session-less token (pre-4d bearer): live only while re-registered within the window", () => {
  const base = { sessionId: null, joinedSessionId: null, sessionLastSeenAt: null };
  assert.equal(deviceTokenIsLive(row({ ...base, updatedAt: new Date(NOW - 29 * DAY) }), NOW), true);
  assert.equal(deviceTokenIsLive(row({ ...base, updatedAt: new Date(NOW - 31 * DAY) }), NOW), false);
});
