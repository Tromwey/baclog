import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOREIGN_GUESSES_PER_EMAIL_PER_HOUR,
  ISSUE_WINDOW_MS,
  LOGIN_CODES_PER_EMAIL_PER_HOUR,
  LOGIN_CODES_PER_ORIGIN_PER_HOUR,
  LOGIN_ISSUE_MARKER_PREFIX,
  LOGIN_FOREIGN_MARKER_PREFIX,
  LOGIN_UNSENT_MARKER_PREFIX,
  LOGIN_UNSENT_PER_ORIGIN_PER_HOUR,
  MAX_ATTEMPTS,
  MERGE_CODES_PER_EMAIL_PER_HOUR,
  OTP_ORIGIN_LENGTH,
  RESEND_COOLDOWN_MS,
  REVIEW_CODES_PER_EMAIL_PER_HOUR,
  REVIEW_ISSUE_CAPS,
  REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR,
  LOGIN_REVIEW_GUESS_MARKER_PREFIX,
  WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR,
  decideIssue,
  decideMergeIssue,
  guessPath,
  isLoginEmailShape,
  missVerdict,
  networkOf,
  normalizeOtpEmail,
  originOfMarkerToken,
  otpOrigin,
  parseCodeToken,
  reviewGuessAllowed,
  wireRefusal,
  type Issuance,
  type LiveCode,
} from "./otp-policy";
import { checkRateLimit, clientIpOf, networkAddress } from "../authz/rate-limit";
import { errorTag, redactedError } from "../authz/safe-log";
import { MailerError, fetchFailureCode, mailCertainlyNotSent } from "./mail-failure";

// Run: pnpm tsx --test src/auth/otp-policy.test.ts

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const MIN = 60_000;
const OWNER = otpOrigin("203.0.113.7");
const STRANGER = otpOrigin("198.51.100.9");
const by = (origin: string | null, ...minutesAgo: number[]): Issuance[] =>
  minutesAgo.map((m) => ({ at: NOW - m * MIN, origin }));

test("a first code is always allowed", () => {
  assert.deepEqual(decideIssue([], OWNER, NOW), { ok: true });
});

test("cooldown: a second code from the same origin inside the minute waits for the rest of it", () => {
  assert.deepEqual(decideIssue([{ at: NOW - 20_000, origin: OWNER }], OWNER, NOW), {
    ok: false,
    reason: "cooldown",
    retryAfterSeconds: 40,
  });
  // The boundary itself is free again.
  assert.deepEqual(decideIssue([{ at: NOW - RESEND_COOLDOWN_MS, origin: OWNER }], OWNER, NOW), { ok: true });
});

test("the limits depend only on when codes were ISSUED, never on the code's row", () => {
  // (issued, origin, now) + the optional caps: no input through which "the
  // row is gone / burned" could shorten a wait.
  assert.equal(decideIssue.length, 3);
});

test("a stranger's requests do not put the owner on cooldown nor spend the owner's five", () => {
  // The regression of ciclo 1: 5 codes an hour PER EMAIL, so five anonymous
  // requests locked the owner out for an hour.
  const strangerMaxedOut = [...by(STRANGER, 50, 40, 30, 20), { at: NOW - 1_000, origin: STRANGER }];
  assert.equal(strangerMaxedOut.length, LOGIN_CODES_PER_ORIGIN_PER_HOUR);
  assert.deepEqual(decideIssue(strangerMaxedOut, OWNER, NOW), { ok: true });
  // …while the stranger is the one who waits.
  assert.deepEqual(decideIssue(strangerMaxedOut, STRANGER, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 10 * 60,
  });
});

test("per-origin hourly cap: the 6th code waits until the oldest leaves the window", () => {
  const issued = by(OWNER, 50, 40, 30, 20, 10);
  assert.deepEqual(decideIssue(issued, OWNER, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 10 * 60,
  });
  assert.deepEqual(decideIssue(issued.slice(1), OWNER, NOW), { ok: true });
});

test("global cap per email: 15 codes an hour across every origin, and it takes three networks", () => {
  const a = otpOrigin("192.0.2.1");
  const b = otpOrigin("192.0.2.2");
  const c = otpOrigin("192.0.2.3");
  const two = [...by(a, 55, 50, 45, 40, 35), ...by(b, 54, 49, 44, 39, 34)];
  assert.deepEqual(decideIssue(two, OWNER, NOW), { ok: true }); // two networks can't lock the owner out
  const three = [...two, ...by(c, 53, 48, 43, 38, 33)];
  assert.equal(three.length, LOGIN_CODES_PER_EMAIL_PER_HOUR);
  assert.deepEqual(decideIssue(three, OWNER, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 5 * 60, // the one from 55 min ago leaves in 5
  });
  // Legacy markers (no origin) count for the email only.
  assert.equal(decideIssue(by(null, ...Array.from({ length: 15 }, (_, i) => i + 2)), OWNER, NOW).ok, false);
  assert.deepEqual(decideIssue(by(null, 0.1), OWNER, NOW), { ok: true });
});

test("an issuance older than the window no longer counts", () => {
  assert.deepEqual(decideIssue(by(OWNER, 61, 40, 30, 20, 10), OWNER, NOW), { ok: true });
  assert.deepEqual(decideIssue([{ at: NOW - ISSUE_WINDOW_MS, origin: OWNER }], OWNER, NOW), { ok: true });
});

test("when several rules refuse, the longest wait is the one reported", () => {
  const issued = [...by(OWNER, 58, 30, 20, 10), { at: NOW - 5_000, origin: OWNER }];
  assert.deepEqual(decideIssue(issued, OWNER, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 2 * 60,
  });
  const burst = [...by(OWNER, 59.9, 30, 20, 10), { at: NOW - 5_000, origin: OWNER }];
  assert.deepEqual(decideIssue(burst, OWNER, NOW), { ok: false, reason: "cooldown", retryAfterSeconds: 55 });
});

test("the App Review account has no hourly caps but keeps the cooldown", () => {
  const none = { perOrigin: Number.MAX_SAFE_INTEGER, perEmail: Number.MAX_SAFE_INTEGER };
  const many = by(OWNER, ...Array.from({ length: 30 }, (_, i) => i + 2));
  assert.deepEqual(decideIssue(many, OWNER, NOW, none), { ok: true });
  assert.equal(decideIssue([...many, { at: NOW - 1_000, origin: OWNER }], OWNER, NOW, none).ok, false);
});

test("wire reason: only a cooldown with a usable code says `cooldown`", () => {
  assert.equal(wireRefusal("cooldown", true), "cooldown");
  assert.equal(wireRefusal("cooldown", false), "hourly_cap"); // mail failed / attempts burned
  assert.equal(wireRefusal("hourly_cap", true), "hourly_cap");
  assert.equal(wireRefusal("hourly_cap", false), "hourly_cap");
});

test("THE BOUND: a mailbox faces at most 85 guesses an hour, each against one code", () => {
  assert.equal(LOGIN_CODES_PER_EMAIL_PER_HOUR * MAX_ATTEMPTS, 75);
  assert.equal(FOREIGN_GUESSES_PER_EMAIL_PER_HOUR, 10);
  assert.equal(WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR, 85);
  assert.ok(WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR / 10 ** 6 < 1e-4);
  // One network alone: its own 5 codes × 5 attempts + the foreign budget.
  assert.equal(LOGIN_CODES_PER_ORIGIN_PER_HOUR * MAX_ATTEMPTS + FOREIGN_GUESSES_PER_EMAIL_PER_HOUR, 35);
});

test("guesses: exhaustive adversary never exceeds the bound and never touches the owner's attempts", () => {
  // Model one hour: 15 issuances (the global cap), each origin guessing
  // through `guessPath` until refused. Count every comparison made.
  const codes: LiveCode[] = [];
  let foreign = 0;
  let comparisons = 0;
  const guess = (origin: string) => {
    const path = guessPath(codes, origin, foreign);
    if (path.kind === "refused") return false;
    if (path.kind === "own") codes[path.index].attempts += 1;
    else foreign += 1;
    comparisons += 1;
    return true;
  };
  codes.push({ origin: OWNER, attempts: 0, expires: NOW + 1 });
  for (let i = 1; i < LOGIN_CODES_PER_EMAIL_PER_HOUR; i++) {
    const attacker = otpOrigin(`192.0.2.${i}`);
    codes.push({ origin: attacker, attempts: 0, expires: NOW + 1 + i });
    while (guess(attacker)) {
      /* until refused */
    }
  }
  // The owner's code is untouched by everything the attackers typed…
  assert.equal(codes[0].attempts, 0);
  // …and the owner still gets its own 5 attempts.
  assert.deepEqual(guessPath(codes, OWNER, foreign), { kind: "own", index: 0 });
  while (guess(OWNER)) {
    /* until refused */
  }
  assert.equal(comparisons, WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR);
  assert.equal(foreign, FOREIGN_GUESSES_PER_EMAIL_PER_HOUR);
});

test("guesses: a stranger with no code of its own draws on the foreign budget only", () => {
  const codes: LiveCode[] = [
    { origin: OWNER, attempts: 0, expires: NOW + 5 * MIN },
    { origin: STRANGER, attempts: MAX_ATTEMPTS, expires: NOW + 9 * MIN }, // burned
  ];
  // Newest code WITH attempts left — the burned one is skipped.
  assert.deepEqual(guessPath(codes, otpOrigin("192.0.2.77"), 0), { kind: "foreign", index: 0 });
  assert.deepEqual(guessPath(codes, STRANGER, 3), { kind: "foreign", index: 0 });
  assert.deepEqual(guessPath(codes, STRANGER, FOREIGN_GUESSES_PER_EMAIL_PER_HOUR), { kind: "refused" });
  // The owner is unaffected by an exhausted foreign budget.
  assert.deepEqual(guessPath(codes, OWNER, FOREIGN_GUESSES_PER_EMAIL_PER_HOUR), { kind: "own", index: 0 });
  // The owner whose address changed mid-login still gets in (foreign path).
  assert.deepEqual(guessPath(codes.slice(0, 1), otpOrigin("203.0.113.200"), 0), { kind: "foreign", index: 0 });
  assert.deepEqual(guessPath([], OWNER, 0), { kind: "refused" });
});

test("origin: IPv4 as is, IPv6 by /64, anything untrusted is ONE shared origin", () => {
  assert.equal(networkOf("203.0.113.7"), "v4:203.0.113.7");
  assert.equal(networkOf("::ffff:203.0.113.7"), "v4:203.0.113.7");
  assert.equal(networkOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "v6:2001:db8:1:2");
  assert.equal(networkOf("2001:db8:1:2::1"), "v6:2001:db8:1:2");
  assert.equal(networkOf("2001:0DB8:0001:0002::"), "v6:2001:db8:1:2");
  assert.equal(networkOf("::1"), "v6:0:0:0:0");
  assert.equal(otpOrigin("2001:db8:1:2::1"), otpOrigin("2001:db8:1:2:ffff:ffff:ffff:ffff"));
  assert.notEqual(otpOrigin("2001:db8:1:2::1"), otpOrigin("2001:db8:1:3::1"));
  for (const bad of [null, undefined, "", "unknown", "999.1.1.1", "1.2.3", "a:b", "1::2::3", "x' or 1=1", "1.2.3.4, 5.6.7.8"]) {
    assert.equal(networkOf(bad), "unknown", JSON.stringify(bad));
  }
  assert.equal(otpOrigin(null), otpOrigin("garbage"));
  assert.match(OWNER, new RegExp(`^[0-9a-f]{${OTP_ORIGIN_LENGTH}}$`));
});

test("row tokens: `<origin>.<nonce>` markers and `<hash>.<origin>` codes; legacy rows parse", () => {
  assert.equal(originOfMarkerToken(`${OWNER}.3f2c8a52-0000-4000-8000-000000000000`), OWNER);
  assert.equal(originOfMarkerToken("3f2c8a52-0000-4000-8000-000000000000"), null);
  assert.deepEqual(parseCodeToken(`${"ab".repeat(32)}.${OWNER}`), { hash: "ab".repeat(32), origin: OWNER });
  assert.deepEqual(parseCodeToken("ab".repeat(32)), { hash: "ab".repeat(32), origin: null });
});

test("merge code: cooldown per (asker, email) and 3 an hour per target email across askers", () => {
  assert.deepEqual(decideMergeIssue([], [], NOW), { ok: true });
  assert.deepEqual(decideMergeIssue([NOW - 20_000], [NOW - 20_000], NOW), {
    ok: false,
    reason: "cooldown",
    retryAfterSeconds: 40,
  });
  // Another asker's fresh code is not MY cooldown…
  assert.deepEqual(decideMergeIssue([], [NOW - 20_000], NOW), { ok: true });
  // …but it counts toward the email's cap.
  const others = [50, 30, 10].map((m) => NOW - m * MIN);
  assert.equal(others.length, MERGE_CODES_PER_EMAIL_PER_HOUR);
  assert.deepEqual(decideMergeIssue([], others, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 10 * 60,
  });
  assert.deepEqual(decideMergeIssue([], [NOW - 61 * MIN, ...others.slice(1)], NOW), { ok: true });
});

test("issue and consume key the row with the SAME normalizer", () => {
  for (const raw of ["Ana@Example.com", "  ana@example.com\n", "ANA@EXAMPLE.COM"]) {
    assert.equal(normalizeOtpEmail(raw), "ana@example.com");
  }
  // No Unicode folding: a look-alike is a DIFFERENT identifier, and not an
  // email at all for the shape gate — it can never reach someone else's row.
  const lookalike = normalizeOtpEmail("ａna@example.com"); // fullwidth "ａ"
  assert.notEqual(lookalike, "ana@example.com");
  assert.equal(isLoginEmailShape(lookalike), false);
});

test("only an email-shaped identifier is ever a login row key", () => {
  assert.equal(isLoginEmailShape("ana@example.com"), true);
  assert.equal(isLoginEmailShape("a.b+tag@sub.example.co"), true);
  for (const bad of [
    "",
    "ana",
    "ana@",
    "@example.com",
    "ana @example.com",
    "ana@exa mple.com",
    "a@b@c",
    "handoff:123",
    "merge:u1:ana@example.com",
    "merge-token:abc",
    `${LOGIN_ISSUE_MARKER_PREFIX}deadbeef`,
    `${LOGIN_FOREIGN_MARKER_PREFIX}deadbeef`,
    `${"a".repeat(250)}@b.co`,
  ]) {
    assert.equal(isLoginEmailShape(bad), false, JSON.stringify(bad));
  }
});

test("checkRateLimit: N hits per key per minute, then Retry-After until the oldest expires", () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 10; i++) assert.deepEqual(checkRateLimit(key, 10, NOW + i * 1000), { ok: true });
  assert.deepEqual(checkRateLimit(key, 10, NOW + 10_000), { ok: false, retryAfterSeconds: 50 });
  // A refused hit is not recorded: the window still frees at the same time.
  assert.deepEqual(checkRateLimit(key, 10, NOW + 59_000), { ok: false, retryAfterSeconds: 1 });
  assert.deepEqual(checkRateLimit(key, 10, NOW + 60_000), { ok: true });
  // Buckets are independent.
  assert.deepEqual(checkRateLimit(`${key}:other`, 1, NOW), { ok: true });
});

test("clientIpOf: only what the platform wrote — never the caller's first XFF hop", () => {
  const bag = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
  // On Vercel: x-real-ip (overwritten by the platform) wins.
  assert.equal(clientIpOf(bag({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }), true), "203.0.113.7");
  // Append semantics: the caller's forged hop is first, the proxy's is LAST.
  assert.equal(clientIpOf(bag({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), true), "203.0.113.7");
  assert.equal(clientIpOf(bag({}), true), "unknown");
  // Off Vercel no proxy is trusted: every header is ignored, one shared bucket.
  assert.equal(clientIpOf(bag({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6" }), false), "unknown");
});

// ---------- ciclo 3 ----------

test("per-IP limiter keys are the NETWORK: IPv4 as is, IPv6 by /64 — the same unit as the OTP origin", () => {
  const bag = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
  const key = (ip: string) => clientIpOf(bag({ "x-real-ip": ip }), true);

  // Every address of one /64 lands in ONE bucket key…
  const a = key("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
  const b = key("2001:db8:1:2::1");
  const c = key("2001:0DB8:0001:0002:ffff:ffff:ffff:ffff");
  assert.equal(a, "2001:db8:1:2::");
  assert.equal(b, a);
  assert.equal(c, a);
  // …and a different /64 in another.
  assert.notEqual(key("2001:db8:1:3::1"), a);
  // IPv4 untouched; IPv4-mapped IPv6 = that IPv4; the last XFF hop too.
  assert.equal(key("203.0.113.7"), "203.0.113.7");
  assert.equal(key("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(clientIpOf(bag({ "x-forwarded-for": "6.6.6.6, 2001:db8:1:2::9" }), true), a);
  // Garbage never becomes its own bucket: the shared one.
  for (const bad of ["", "not-an-ip", "1.2.3.4.5", "2001:db8::1::2", "999.1.1.1"]) {
    assert.equal(key(bad), "unknown", JSON.stringify(bad));
  }

  // The key is the same network the OTP origin uses, and it is a fixed point.
  for (const ip of ["203.0.113.7", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", "::ffff:203.0.113.7", "::1", "junk"]) {
    assert.equal(networkOf(networkAddress(ip)), networkOf(ip), ip);
    assert.equal(otpOrigin(key(ip)), otpOrigin(ip), ip);
    assert.equal(networkAddress(networkAddress(ip)), networkAddress(ip), ip);
  }

  // What it buys: 2^64 addresses of one subscriber share one window.
  const bucket = `c3-ip:${NOW}`;
  let passed = 0;
  for (let i = 0; i < 50; i++) {
    if (checkRateLimit(`${bucket}:${key(`2001:db8:9:9::${i.toString(16)}`)}`, 10, NOW).ok) passed++;
  }
  assert.equal(passed, 10);
});

test("App Review demo account: the guess bound does not depend on origins or issuances", () => {
  // Issuing is far above the normal caps (15 an hour)…
  const origin = otpOrigin("203.0.113.7");
  const many: Issuance[] = Array.from({ length: REVIEW_CODES_PER_EMAIL_PER_HOUR - 1 }, (_, i) => ({
    at: NOW - RESEND_COOLDOWN_MS - 1 - i,
    origin: otpOrigin(`2001:db8:${i.toString(16)}::1`),
  }));
  assert.deepEqual(decideIssue(many, origin, NOW, REVIEW_ISSUE_CAPS), { ok: true });
  assert.equal(decideIssue([{ at: NOW - 1000, origin }], origin, NOW, REVIEW_ISSUE_CAPS).ok, false);

  // …so the bound is the gate every guess passes first: an adversary with N
  // origins, each with its own freshly issued code (5 attempts apiece), gets
  // exactly the cap compared — not 5 × N.
  for (const origins of [1, 4, 10_000]) {
    let reserved = 0;
    let compared = 0;
    for (let o = 0; o < origins && compared <= REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR; o++) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (!reviewGuessAllowed(reserved)) break;
        reserved++; // a wrong guess keeps its slot
        compared++;
      }
    }
    assert.equal(compared, Math.min(origins * MAX_ATTEMPTS, REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR));
  }
  assert.equal(REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR, 20);

  // A correct guess gives its slot back: reviewers signing in spend nothing.
  let reserved = 0;
  for (let i = 0; i < 1000; i++) {
    assert.equal(reviewGuessAllowed(reserved), true);
    reserved++;
    reserved--; // refund on match
  }
  assert.equal(reserved, 0);

  // Its markers live in a reserved namespace no login email can have.
  assert.equal(isLoginEmailShape(`${LOGIN_REVIEW_GUESS_MARKER_PREFIX}${"a".repeat(64)}`), false);
});

test("safe-log: a query failure never prints its params", () => {
  const email = "owner@example.com";
  const hash = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "pk"'), {
    name: "NeonDbError",
    code: "23505",
  });
  const err = Object.assign(
    new Error(`Failed query: insert into "verificationToken" (identifier, token) values ($1, $2)\nparams: ${email},${hash}.abcd`),
    { name: "DrizzleQueryError", params: [email, `${hash}.abcd`], cause },
  );

  const tag = errorTag(err);
  assert.equal(tag, "DrizzleQueryError <- NeonDbError(23505)");

  const line = redactedError(err);
  for (const out of [tag, line]) {
    assert.equal(out.includes(email), false);
    assert.equal(out.includes(hash), false);
  }
  assert.match(line, /Failed query: insert into "verificationToken"/);
  assert.match(line, /params: \[redacted\]/);
  assert.match(line, /cause: NeonDbError\(23505\)/);

  // Non-errors and odd codes don't leak free text either.
  assert.equal(errorTag("boom"), "string");
  assert.equal(errorTag(Object.assign(new Error("x"), { code: "has spaces and owner@example.com" })), "Error");
});

test("App Review demo account: issuing is high but FINITE — 200 an hour across every origin", () => {
  assert.equal(REVIEW_CODES_PER_EMAIL_PER_HOUR, 200);
  assert.equal(Number.isSafeInteger(REVIEW_ISSUE_CAPS.perEmail) && REVIEW_ISSUE_CAPS.perEmail <= 200, true);
  assert.equal(REVIEW_ISSUE_CAPS.perOrigin <= REVIEW_ISSUE_CAPS.perEmail, true);
  const fresh = otpOrigin("17.0.0.1");
  // 200 codes from 200 different /64s, the oldest 50 minutes ago…
  const full: Issuance[] = Array.from({ length: 200 }, (_, i) => ({
    at: NOW - 50 * MIN + i * 1000,
    origin: otpOrigin(`2001:db8:${(i + 1).toString(16)}::1`),
  }));
  // …a 201st, from a network that never asked, waits for the oldest to age out.
  assert.deepEqual(decideIssue(full, fresh, NOW, REVIEW_ISSUE_CAPS), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: 600,
  });
  assert.deepEqual(decideIssue(full.slice(1), fresh, NOW, REVIEW_ISSUE_CAPS), { ok: true });
  // The normal caps are untouched.
  assert.equal(decideIssue(full.slice(0, 15), fresh, NOW).ok, false);
});

test("a failed send gives the issuance back: it keeps the cooldown and counts toward no cap", () => {
  // Five sends failed in a row (a mailer outage), the last one 61 s ago.
  const failed: Issuance[] = [50, 40, 30, 20, 1.02].map((m) => ({ at: NOW - m * MIN, origin: OWNER, unsent: true }));
  // Before: 5 markers = the origin's hourly cap → up to an hour out.
  assert.equal(decideIssue(failed.map(({ at, origin }) => ({ at, origin })), OWNER, NOW).ok, false);
  // Now: none of them counts — the owner's next request issues normally.
  assert.deepEqual(decideIssue(failed, OWNER, NOW), { ok: true });

  // Inside the minute the cooldown still holds (no retry storm against the mailer)…
  const justFailed: Issuance[] = [{ at: NOW - 20_000, origin: OWNER, unsent: true }];
  const refusal = decideIssue(justFailed, OWNER, NOW);
  assert.deepEqual(refusal, { ok: false, reason: "cooldown", retryAfterSeconds: 40 });
  // …and the wire never says "revisa tu correo": the code was withdrawn.
  assert.equal(wireRefusal("cooldown", false), "hourly_cap");
  // It is this origin's cooldown only.
  assert.deepEqual(decideIssue(justFailed, STRANGER, NOW), { ok: true });

  // Unsent issuances don't fill the origin's five nor the email's fifteen.
  const four = by(OWNER, 50, 40, 30, 20);
  assert.deepEqual(decideIssue([...four, ...failed], OWNER, NOW), { ok: true });
  const fourteen: Issuance[] = Array.from({ length: 14 }, (_, i) => ({ at: NOW - (i + 2) * MIN, origin: `net${i % 3}` }));
  assert.deepEqual(decideIssue([...fourteen, ...failed], OWNER, NOW), { ok: true });
  // A SENT fifth still closes the origin's cap, as always.
  assert.equal(decideIssue([...four, { at: NOW - 10 * MIN, origin: OWNER }], OWNER, NOW).ok, false);

  // The unsent markers live in a namespace no login email can have.
  assert.equal(isLoginEmailShape(`${LOGIN_UNSENT_MARKER_PREFIX}${"a".repeat(64)}`), false);
});

test("refused sends have a loose hourly cap of their own per (email, origin)", () => {
  // An address Resend refuses synchronously: one issuance a minute, each one
  // refunded. Before: 60 an hour per origin, a Resend call each, forever.
  const refused = (n: number): Issuance[] =>
    Array.from({ length: n }, (_, i) => ({ at: NOW - (i + 2) * MIN, origin: OWNER, unsent: true }));
  assert.deepEqual(decideIssue(refused(LOGIN_UNSENT_PER_ORIGIN_PER_HOUR - 1), OWNER, NOW), { ok: true });
  // The 20th is in: the next waits until the OLDEST of them is an hour old.
  assert.deepEqual(decideIssue(refused(LOGIN_UNSENT_PER_ORIGIN_PER_HOUR), OWNER, NOW), {
    ok: false,
    reason: "hourly_cap",
    retryAfterSeconds: (60 - (LOGIN_UNSENT_PER_ORIGIN_PER_HOUR + 1)) * 60,
  });
  // Per origin: somebody else's refused sends never close the owner's door…
  assert.deepEqual(decideIssue(refused(LOGIN_UNSENT_PER_ORIGIN_PER_HOUR), STRANGER, NOW), { ok: true });
  // …and it is looser than the code cap it stands apart from.
  assert.ok(LOGIN_UNSENT_PER_ORIGIN_PER_HOUR > LOGIN_CODES_PER_ORIGIN_PER_HOUR);
  assert.ok(LOGIN_UNSENT_PER_ORIGIN_PER_HOUR < ISSUE_WINDOW_MS / RESEND_COOLDOWN_MS);
});

test("mailer failures: a safe code for the log, and only a certain non-send withdraws the code", () => {
  // Certainly not sent → withdraw + refund.
  assert.equal(mailCertainlyNotSent(new MailerError("no_api_key")), true);
  for (const status of [401, 403, 422, 429, 500, 503]) {
    assert.equal(mailCertainlyNotSent(new MailerError(`resend_${status}`)), true);
  }
  // The mail may have gone out → the code and its issuance stay.
  assert.equal(mailCertainlyNotSent(new MailerError("timeout")), false);
  assert.equal(mailCertainlyNotSent(new MailerError("network")), false);
  // Anything we don't recognize is NOT proof that nothing was sent.
  assert.equal(mailCertainlyNotSent(new Error("Resend failed: 403")), false);
  assert.equal(mailCertainlyNotSent(Object.assign(new Error("x"), { code: "resend_403" })), false);
  assert.equal(mailCertainlyNotSent(null), false);

  // What `fetch` rejects with: AbortSignal.timeout → TimeoutError.
  assert.equal(fetchFailureCode(new DOMException("The operation timed out", "TimeoutError")), "timeout");
  assert.equal(fetchFailureCode(new TypeError("fetch failed")), "network");
  assert.equal(fetchFailureCode(undefined), "network");

  // The log line: which failure, and nothing of the address or of a body.
  assert.equal(errorTag(new MailerError("no_api_key")), "MailerError(no_api_key)");
  assert.equal(errorTag(new MailerError("resend_429")), "MailerError(resend_429)");
  assert.equal(errorTag(new MailerError("timeout")), "MailerError(timeout)");
  assert.equal(new MailerError("resend_403").message.includes("@"), false);
});

test("a refused guess is `locked` only when an attempt limit is what refused it", () => {
  // Compared with this origin's own code and missed: wrong.
  assert.equal(missVerdict("own", false), "wrong");
  // No budget left (foreign slots / the demo account's guesses): locked, compared with nothing.
  assert.equal(missVerdict("refused", false), "locked");
  assert.equal(missVerdict("refused", true), "locked");
  // Foreign path: expired / never asked / somebody else's code → wrong…
  assert.equal(missVerdict("foreign", false), "wrong");
  // …but if THIS origin's code is alive with its attempts spent → locked.
  assert.equal(missVerdict("foreign", true), "locked");

  // End to end over the pure model: 5 wrong guesses are `wrong`, the 6th is `locked`.
  const codes: LiveCode[] = [{ origin: OWNER, attempts: 0, expires: NOW + 10 * MIN }];
  const seen: string[] = [];
  let foreign = 0;
  for (let i = 0; i < 7; i++) {
    const path = guessPath(codes, OWNER, foreign);
    const burned = codes.some((c) => c.origin === OWNER && c.attempts >= MAX_ATTEMPTS);
    if (path.kind === "own") {
      codes[path.index].attempts++;
      seen.push(missVerdict("own", burned));
    } else {
      // `guessPath` says "refused" both for "no slot" and "no live code"; the SQL
      // gate only refuses for the slot — with slots left it is a foreign miss.
      const slot = foreign < FOREIGN_GUESSES_PER_EMAIL_PER_HOUR;
      if (slot) foreign++;
      seen.push(missVerdict(slot ? "foreign" : "refused", burned));
    }
  }
  assert.deepEqual(seen, ["wrong", "wrong", "wrong", "wrong", "wrong", "locked", "locked"]);

  // An address nobody asked a code for (account or not): never `locked` until
  // the caller itself spends the email's foreign budget — the answer does not
  // depend on the account existing, only on rows the caller's own requests wrote.
  const none: string[] = [];
  for (let i = 0; i < FOREIGN_GUESSES_PER_EMAIL_PER_HOUR + 1; i++) {
    none.push(missVerdict(i < FOREIGN_GUESSES_PER_EMAIL_PER_HOUR ? "foreign" : "refused", false));
  }
  assert.deepEqual(none, [...Array(FOREIGN_GUESSES_PER_EMAIL_PER_HOUR).fill("wrong"), "locked"]);
});

test("safe-log: what afterResponse prints for a failed task carries no bound value", () => {
  // `saveAppleRefreshToken` failing after the response: the params are the
  // refresh token and Apple's `sub`.
  const token = "r1f8a.0.rrxy.SECRET-apple-refresh-token";
  const err = Object.assign(
    new Error(`Failed query: update "account" set "refresh_token" = $1 where "provider" = $2\nparams: ${token},apple,000123.abc`),
    { name: "DrizzleQueryError", params: [token, "apple", "000123.abc"], cause: Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }) },
  );
  const line = `[auth/apple web refresh token] ${redactedError(err)}`;
  assert.equal(line.includes(token), false);
  assert.equal(line.includes("000123.abc"), false);
  assert.match(line, /^\[auth\/apple web refresh token\] DrizzleQueryError: Failed query: update "account"/);
  assert.match(line, /cause: Error\(ECONNRESET\): fetch failed/);
});
