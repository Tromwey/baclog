/**
 * Exercises the SHIPPED OTP gate SQL (`src/auth/otp-sql.ts`) on a THROWAWAY
 * Postgres. It refuses anything that is not loopback — never point it at the
 * shared Neon database (it creates and truncates "verificationToken").
 *
 *   (if Postgres dies at start with "postmaster se volvió multi-hilo": export LC_ALL=en_US.UTF-8)
 *   initdb -D /tmp/otp-pg && pg_ctl -D /tmp/otp-pg -o "-p 54329 -c listen_addresses=127.0.0.1" start
 *   createdb -h 127.0.0.1 -p 54329 otp
 *   OTP_HARNESS_URL=postgres://127.0.0.1:54329/otp pnpm tsx scripts/otp-sql-harness.ts
 *
 * Each batch runs as ONE transaction on its own connection, like `db.batch`
 * on Neon HTTP.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  FOREIGN_GUESSES_PER_EMAIL_PER_HOUR,
  LOGIN_ISSUE_CAPS,
  LOGIN_UNSENT_PER_ORIGIN_PER_HOUR,
  MAX_ATTEMPTS,
  MERGE_CODES_PER_EMAIL_PER_HOUR,
  RESEND_COOLDOWN_MS,
  REVIEW_CODES_PER_EMAIL_PER_HOUR,
  REVIEW_ISSUE_CAPS,
  REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR,
  WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR,
  missVerdict,
  otpOrigin,
  parseCodeToken,
} from "../src/auth/otp-policy";
import {
  FOREIGN_GUESS,
  ISSUE_LOGIN,
  ISSUE_MERGE,
  REVIEW_GUESS,
  foreignGuessSql,
  issueLoginSql,
  issueMergeSql,
  refundReviewGuessSql,
  reviewGuessSql,
  spendOwnAttemptSql,
  withdrawMergeUnsentSql,
  withdrawUnsentSql,
} from "../src/auth/otp-sql";

const url = process.env.OTP_HARNESS_URL ?? "";
const host = url ? new URL(url).hostname : "";
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error("OTP_HARNESS_URL must be a loopback Postgres (throwaway). Refusing.");
  process.exit(2);
}

const pool = new Pool({ connectionString: url, max: 40 });
const dialect = new PgDialect();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function batch(statements: SQL[]): Promise<Record<string, unknown>[][]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out: Record<string, unknown>[][] = [];
    for (const s of statements) {
      const q = dialect.sqlToQuery(s);
      out.push((await client.query(q.sql, q.params as unknown[])).rows);
    }
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

const EMAIL = "owner@example.com";
const MARKER = `otp-issued:${sha(EMAIL)}`;
const UNSENT = `otp-unsent:${sha(EMAIL)}`;
const FOREIGN = `otp-foreign:${sha(EMAIL)}`;

const REVIEW = `otp-review-guess:${sha(EMAIL)}`;

async function issue(ip: string, code: string, now: number, caps = LOGIN_ISSUE_CAPS) {
  return (await issueFull(ip, code, now, caps)).result;
}

/** `issueOtp`'s transaction, keeping what a failed send needs to give it back. */
async function issueFull(ip: string, code: string, now: number, caps = LOGIN_ISSUE_CAPS) {
  const nonce = randomUUID();
  const r = await batch(
    issueLoginSql({
      email: EMAIL, marker: MARKER, unsentMarker: UNSENT, origin: otpOrigin(ip), nonce,
      codeHash: sha(code), now, caps,
    }),
  );
  return {
    result: { issued: r[ISSUE_LOGIN.gate].length === 1, usable: r[ISSUE_LOGIN.usable].length === 1 },
    markers: r[ISSUE_LOGIN.markers],
    /** What `otp.ts` runs when the mail of THIS issuance could not be sent. */
    sendFailed: () =>
      batch(withdrawUnsentSql({
        email: EMAIL, marker: MARKER, unsentMarker: UNSENT, origin: otpOrigin(ip), nonce,
        codeHash: sha(code), issuedAt: now,
      })),
  };
}

/** `consumeLoginCode` without the final DELETE: was the guess COMPARED, and did it match? */
async function guess(ip: string, code: string, now: number): Promise<"match" | "miss" | "refused"> {
  return (await guessFull(ip, code, now)).outcome;
}

/** The same, plus what the caller is TOLD about a guess that didn't match
 *  (`missVerdict`, fed exactly as `compareLoginCode` feeds it). */
async function guessFull(ip: string, code: string, now: number) {
  const own = (await batch([spendOwnAttemptSql(EMAIL, otpOrigin(ip), now)]))[0];
  if (own.length > 0) {
    const hit = own.some((r) => parseCodeToken(String(r.token)).hash === sha(code));
    return { outcome: hit ? "match" as const : "miss" as const, told: hit ? "match" : missVerdict("own", false) };
  }
  const r = await batch(foreignGuessSql({ email: EMAIL, marker: FOREIGN, origin: otpOrigin(ip), nonce: randomUUID(), now }));
  const burned = r[FOREIGN_GUESS.ownBurned].length > 0;
  if (r[FOREIGN_GUESS.gate].length === 0) return { outcome: "refused" as const, told: missVerdict("refused", burned) };
  const [newest] = r[FOREIGN_GUESS.code];
  const hit = !!newest && parseCodeToken(String(newest.token)).hash === sha(code);
  return { outcome: hit ? "match" as const : "miss" as const, told: hit ? "match" : missVerdict("foreign", burned) };
}

/** `consumeLoginCode` for the App Review demo account: the global gate, then
 *  the same own / foreign comparison, and the refund on a match. */
async function reviewGuess(ip: string, code: string, now: number): Promise<"match" | "miss" | "refused"> {
  const nonce = randomUUID();
  const gate = await batch(reviewGuessSql({ marker: REVIEW, nonce, now }));
  if (gate[REVIEW_GUESS.gate].length === 0) return "refused";
  const outcome = await guess(ip, code, now);
  if (outcome === "match") await batch([refundReviewGuessSql(REVIEW, nonce)]);
  return outcome;
}

const codes = async () =>
  (await pool.query(`select token, attempts from "verificationToken" where identifier = $1`, [EMAIL])).rows;
const reset = () => pool.query(`truncate "verificationToken"`);

async function main() {
  await pool.query(`
    create table if not exists "verificationToken" (
      identifier text not null, token text not null, expires timestamp not null,
      attempts smallint not null default 0, primary key (identifier, token))`);
  const T0 = Date.now();
  const OWNER = "203.0.113.7";

  // 1. 30 concurrent issuances from ONE origin → 1 code, 1 marker.
  await reset();
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => issue(OWNER, `10000${i % 10}`, T0)));
  assert.equal(burst.filter((b) => b.issued).length, 1);
  assert.equal((await codes()).length, 1);
  console.log("ok 1  30 concurrent issuances, one origin → 1 issued, 1 live code");

  // 2. A stranger maxes out its own 5/h: the owner's code survives and the owner can still ask.
  await reset();
  assert.equal((await issue(OWNER, "111111", T0)).issued, true);
  let strangerIssued = 0;
  for (let i = 0; i < 8; i++) {
    if ((await issue("198.51.100.9", `22222${i}`, T0 + i * (RESEND_COOLDOWN_MS + 1))).issued) strangerIssued++;
  }
  assert.equal(strangerIssued, LOGIN_ISSUE_CAPS.perOrigin);
  const afterStranger = await codes();
  assert.equal(afterStranger.length, 2); // owner's + the stranger's newest (one per origin)
  assert.ok(afterStranger.some((c) => parseCodeToken(c.token).hash === sha("111111")));
  assert.equal((await issue(OWNER, "333333", T0 + 9 * 60_000)).issued, true);
  console.log(`ok 2  stranger issued ${strangerIssued}/8 (own cap), owner's code alive, owner re-issues`);

  // 3. A stranger's wrong guesses never spend the owner's attempts.
  await reset();
  await issue(OWNER, "111111", T0);
  const outcomes: string[] = [];
  for (let i = 0; i < 30; i++) outcomes.push(await guess("198.51.100.9", "000000", T0 + 1000));
  assert.equal(outcomes.filter((o) => o === "miss").length, FOREIGN_GUESSES_PER_EMAIL_PER_HOUR);
  assert.equal(outcomes.filter((o) => o === "refused").length, 30 - FOREIGN_GUESSES_PER_EMAIL_PER_HOUR);
  assert.equal((await codes())[0].attempts, 0);
  assert.equal(await guess(OWNER, "111111", T0 + 2000), "match");
  console.log("ok 3  30 foreign wrong guesses → 10 compared, 20 refused, owner attempts 0, owner's code matches");

  // 4. Own-origin attempts are atomic: 40 parallel wrong guesses spend exactly 5.
  await reset();
  await issue(OWNER, "111111", T0);
  await pool.query(`insert into "verificationToken" select $1, g::text, $3::timestamp from generate_series(1, $2::int) g`, [FOREIGN, FOREIGN_GUESSES_PER_EMAIL_PER_HOUR, new Date(T0 + 3_600_000).toISOString()]); // foreign budget already spent
  const par = await Promise.all(Array.from({ length: 40 }, () => guess(OWNER, "000000", T0 + 1000)));
  assert.equal(par.filter((o) => o === "miss").length, MAX_ATTEMPTS);
  assert.equal((await codes())[0].attempts, MAX_ATTEMPTS);
  assert.equal(await guess(OWNER, "111111", T0 + 2000), "refused"); // dead: the right code no longer works
  console.log("ok 4  40 parallel own-origin wrong guesses → 5 compared, code dead");

  // 5. THE BOUND: 40 networks issue and guess as much as allowed, in parallel.
  await reset();
  const nets = Array.from({ length: 40 }, (_, i) => `192.0.2.${i + 1}`);
  const issuedBy = await Promise.all(nets.map((ip, i) => issue(ip, `4${String(i).padStart(5, "0")}`, T0)));
  assert.equal(issuedBy.filter((b) => b.issued).length, LOGIN_ISSUE_CAPS.perEmail);
  const all = (await Promise.all(nets.flatMap((ip) => Array.from({ length: 12 }, () => guess(ip, "999999", T0 + 1000))))).filter((o) => o !== "refused");
  assert.equal(all.length, WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR);
  console.log(`ok 5  40 networks: ${issuedBy.filter((b) => b.issued).length} codes issued (global cap), ${all.length} guesses compared of ${40 * 12} (bound ${WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR})`);

  // 6. Cooldown answer knows whether the origin's code is still usable.
  await reset();
  await issue(OWNER, "111111", T0);
  assert.deepEqual(await issue(OWNER, "555555", T0 + 5000), { issued: false, usable: true });
  await pool.query(`delete from "verificationToken" where identifier = $1`, [EMAIL]); // mail failed → withdrawn
  assert.deepEqual(await issue(OWNER, "555555", T0 + 6000), { issued: false, usable: false });
  console.log("ok 6  cooldown refusal: usable=true with a live code, usable=false once withdrawn");

  // 7. Merge: 30 concurrent requests from ONE asker → 1 row; 5 askers → 3 rows; re-issue kills the previous.
  await reset();
  const mergeIssue = (asker: string, code: string, now: number) =>
    batch(issueMergeSql({ identifier: `merge:${asker}:${EMAIL}`, email: EMAIL, mergePrefix: "merge:", codeHash: sha(code), now }))
      .then((r) => r[ISSUE_MERGE.gate].length === 1);
  const m1 = await Promise.all(Array.from({ length: 30 }, (_, i) => mergeIssue("u1", `60000${i % 10}`, T0)));
  assert.equal(m1.filter(Boolean).length, 1);
  assert.equal(await mergeIssue("u1", "700000", T0 + RESEND_COOLDOWN_MS + 1), true);
  const u1 = (await pool.query(`select attempts from "verificationToken" where identifier = $1 order by expires`, [`merge:u1:${EMAIL}`])).rows;
  assert.deepEqual(u1.map((r) => r.attempts), [MAX_ATTEMPTS, 0]); // ONE usable row per identifier
  const m2 = await Promise.all(["u2", "u3", "u4", "u5", "u6"].map((u) => mergeIssue(u, "800000", T0 + 2 * RESEND_COOLDOWN_MS)));
  assert.equal(m2.filter(Boolean).length, MERGE_CODES_PER_EMAIL_PER_HOUR - 2);
  const total = (await pool.query(`select count(*)::int n from "verificationToken" where identifier like 'merge:%'`)).rows[0].n;
  assert.equal(total, MERGE_CODES_PER_EMAIL_PER_HOUR);
  // `_` in the address is not a wildcard: a look-alike email has its own cap.
  assert.equal(await batch(issueMergeSql({ identifier: "merge:u9:owner@exampleXcom", email: "owner@exampleXcom", mergePrefix: "merge:", codeHash: sha("1"), now: T0 })).then((r) => r[ISSUE_MERGE.gate].length), 1);
  console.log("ok 7  merge: 30 concurrent → 1 row; re-issue leaves 1 usable; 5 askers in parallel → cap of 3 per email holds");

  // 8. App Review demo account (FIXED code, no hourly issuing caps): 300 /64 networks each get
  //    their own code and fire 5 wrong guesses, all in parallel. Before: 5 compared per network.
  await reset();
  const FIXED = "424242";
  const v6 = Array.from({ length: 300 }, (_, i) => `2001:db8:${(i + 1).toString(16)}:1::1`);
  const reviewIssued = await Promise.all(v6.map((ip) => issue(ip, FIXED, T0, REVIEW_ISSUE_CAPS)));
  // Issuing is NOT the guess bound, but it is finite (ronda 4): 200 an hour across every origin.
  assert.equal(reviewIssued.filter((b) => b.issued).length, REVIEW_CODES_PER_EMAIL_PER_HOUR);
  const reviewRows = (await pool.query(`select count(*)::int n from "verificationToken"`)).rows[0].n;
  assert.equal(reviewRows, 2 * REVIEW_CODES_PER_EMAIL_PER_HOUR); // 200 markers + 200 codes, not 600
  assert.equal((await issue("17.0.0.9", FIXED, T0 + 5000, REVIEW_ISSUE_CAPS)).issued, false); // a 201st network waits
  const wrong = await Promise.all(v6.flatMap((ip) => Array.from({ length: 5 }, () => reviewGuess(ip, "000000", T0 + 1000))));
  const comparedWrong = wrong.filter((o) => o !== "refused").length;
  assert.equal(comparedWrong, REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR);
  // Saturated: even the right code is refused uncompared (the lockout a third party CAN cause)…
  assert.equal(await reviewGuess(v6[0], FIXED, T0 + 2000), "refused");
  // …until the slots age out (an hour after they were taken).
  const LATER = T0 + 1000 + 3_600_000 + 1;
  assert.equal((await issue("17.0.0.1", FIXED, LATER, REVIEW_ISSUE_CAPS)).issued, true);
  assert.equal(await reviewGuess("17.0.0.1", FIXED, LATER + 500), "match");
  // A correct guess refunds its slot: 60 reviewer sign-ins in a row spend nothing.
  await reset();
  for (let i = 0; i < 60; i++) {
    const at = T0 + i * (RESEND_COOLDOWN_MS + 1);
    assert.equal((await issue("17.0.0.1", FIXED, at, REVIEW_ISSUE_CAPS)).issued, true);
    assert.equal(await reviewGuess("17.0.0.1", FIXED, at + 500), "match");
    await pool.query(`delete from "verificationToken" where identifier = $1`, [EMAIL]); // burnCodeRow
  }
  const slots = (await pool.query(`select count(*)::int n from "verificationToken" where identifier = $1`, [REVIEW])).rows[0].n;
  assert.equal(slots, 0);
  // Same /64, different addresses = ONE origin: the second address is on the first one's cooldown.
  await reset();
  assert.equal((await issue("2001:db8:7:7::1", FIXED, T0, REVIEW_ISSUE_CAPS)).issued, true);
  assert.equal((await issue("2001:db8:7:7:ffff::2", FIXED, T0 + 1000, REVIEW_ISSUE_CAPS)).issued, false);
  console.log(`ok 8a review account: 300 networks ask at once → ${REVIEW_CODES_PER_EMAIL_PER_HOUR} issued, ${reviewRows} rows in the table (issuing cap)`);
  console.log(`ok 8  review account: 300 networks × 5 wrong guesses in parallel → ${comparedWrong} compared of ${wrong.length} (cap ${REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR}); saturated = refused, frees after 1 h; 60 correct sign-ins leave 0 slots spent`);

  // 9. A send that fails gives the issuance back (ronda 4). Five failed sends in a row used to
  //    be the origin's whole hour; now the next request issues, and only the cooldown is kept.
  await reset();
  const STEP = RESEND_COOLDOWN_MS + 1;
  for (let i = 0; i < 5; i++) {
    const attempt = await issueFull(OWNER, `90000${i}`, T0 + i * STEP);
    assert.equal(attempt.result.issued, true);
    const undone = await attempt.sendFailed();
    assert.equal(undone[1].length, 1); // the marker moved
    assert.equal((await codes()).length, 0); // the code nobody received is gone
  }
  const counted = async () =>
    (await pool.query(`select count(*)::int n from "verificationToken" where identifier = $1`, [MARKER])).rows[0].n;
  assert.equal(await counted(), 0); // nothing left counting toward the hourly caps
  // Inside the minute after the 5th failure: refused (cooldown), and there is no code to point at…
  const tooSoon = await issueFull(OWNER, "900009", T0 + 4 * STEP + 20_000);
  assert.deepEqual(tooSoon.result, { issued: false, usable: false });
  assert.deepEqual(tooSoon.markers.map((m) => m.unsent), Array(5).fill(true)); // they live their hour (ronda 5)
  assert.equal(Math.max(...tooSoon.markers.map((m) => Number(m.expiresMs))) - 3_600_000, T0 + 4 * STEP); // decideIssue reads the real issue time
  // …a stranger's network is not on that cooldown…
  assert.equal((await issue("198.51.100.9", "900008", T0 + 4 * STEP + 21_000)).issued, true);
  // …and a minute after the failure the owner issues normally: the 6th request of the hour.
  const sixth = await issueFull(OWNER, "900010", T0 + 5 * STEP);
  assert.equal(sixth.result.issued, true);
  assert.equal(await guess(OWNER, "900010", T0 + 5 * STEP + 1000), "match");
  // Sent codes still count: four more sent ones close the origin's cap of five.
  for (let i = 6; i < 10; i++) assert.equal((await issue(OWNER, `9100${i}0`, T0 + i * STEP)).issued, true);
  assert.equal((await issue(OWNER, "910100", T0 + 10 * STEP)).issued, false);
  assert.equal(await counted(), LOGIN_ISSUE_CAPS.perOrigin + 1); // the owner's five + the stranger's one
  // A failed send never withdraws a NEWER code of the same origin.
  await reset();
  const first = await issueFull(OWNER, "920001", T0);
  await pool.query(`update "verificationToken" set expires = expires - interval '2 minutes' where identifier = $1`, [MARKER]);
  assert.equal((await issue(OWNER, "920002", T0 + 1000)).issued, true); // replaces the origin's code
  await first.sendFailed();
  assert.equal(await guess(OWNER, "920002", T0 + 2000), "match");
  console.log("ok 9  failed send: code withdrawn + issuance refunded — 5 failures leave 0 counted, cooldown kept ≤ 60 s, 6th request issues; sent codes still cap at 5");

  // 10. `locked` vs `wrong` (ronda 4): what the caller is told, from the rows the shipped SQL reads.
  await reset();
  await issue(OWNER, "111111", T0);
  const told: string[] = [];
  for (let i = 0; i < 7; i++) told.push((await guessFull(OWNER, "000000", T0 + 1000 + i)).told);
  assert.deepEqual(told, ["wrong", "wrong", "wrong", "wrong", "wrong", "locked", "locked"]);
  assert.equal((await guessFull(OWNER, "111111", T0 + 2000)).told, "locked"); // even the right code: it is dead
  // A network that never asked, on an address with a live code: wrong ×(what is left of 10), then locked.
  const strangerTold: string[] = [];
  for (let i = 0; i < 9; i++) strangerTold.push((await guessFull("198.51.100.9", "000000", T0 + 3000 + i)).told);
  assert.deepEqual(strangerTold, [...Array(7).fill("wrong"), "locked", "locked"]); // the owner's 3 foreign tries count too
  // Same answers for an address NOBODY asked a code for (no rows at all): no existence signal.
  await reset();
  const cold: string[] = [];
  for (let i = 0; i < 11; i++) cold.push((await guessFull("198.51.100.9", "000000", T0 + i)).told);
  assert.deepEqual(cold, [...Array(FOREIGN_GUESSES_PER_EMAIL_PER_HOUR).fill("wrong"), "locked"]);
  // An EXPIRED own code is `wrong` (ask for a new one), never `locked`.
  await reset();
  await issue(OWNER, "111111", T0);
  assert.equal((await guessFull(OWNER, "000000", T0 + 11 * 60_000)).told, "wrong");
  console.log("ok 10 locked vs wrong: 5 misses = wrong, then locked (right code included); foreign budget spent = locked; no rows / expired = wrong");

  // 11. Refused sends have their own loose cap per (email, origin) (ronda 5): an address the
  //     mailer refuses every time was 60 issuances an hour per origin (a Resend call each).
  await reset();
  let refusedIssued = 0;
  for (let i = 0; i < 30; i++) {
    const attempt = await issueFull(OWNER, `93${String(i).padStart(4, "0")}`, T0 + i * STEP);
    if (!attempt.result.issued) continue;
    refusedIssued++;
    await attempt.sendFailed();
  }
  assert.equal(refusedIssued, LOGIN_UNSENT_PER_ORIGIN_PER_HOUR);
  assert.equal(await counted(), 0); // none of them counts toward the code caps
  assert.equal((await codes()).length, 0);
  // Per (email, ORIGIN): another network asking for the same address is not behind that cap.
  assert.equal((await issue("198.51.100.9", "930099", T0 + 30 * STEP)).issued, true);
  // The cap is a rolling hour: a slot frees when the oldest refused send is an hour old.
  assert.equal((await issue(OWNER, "930100", T0 + 3_600_000 - 1)).issued, false);
  assert.equal((await issue(OWNER, "930100", T0 + 3_600_000 + 1)).issued, true);
  console.log(`ok 11 refused sends: 30 requests a minute apart → ${refusedIssued} issued (cap ${LOGIN_UNSENT_PER_ORIGIN_PER_HOUR} per email+origin), other origin unaffected, frees after 1 h`);

  // 12. Merge: a refused mail withdraws the code and gives the issuance back (ronda 5).
  await reset();
  const ident = (asker: string) => `merge:${asker}:${EMAIL}`;
  const mergeFull = (asker: string, code: string, now: number) =>
    batch(issueMergeSql({ identifier: ident(asker), email: EMAIL, mergePrefix: "merge:", codeHash: sha(code), now }));
  const mergeSendFailed = (asker: string, code: string) =>
    batch([withdrawMergeUnsentSql({ identifier: ident(asker), codeHash: sha(code), nonce: randomUUID() })]);
  /** `consumeCode`'s UPDATE: rows of this asker that still have an attempt. */
  const mergeUsable = async (asker: string) =>
    (await pool.query(`select token from "verificationToken" where identifier = $1 and attempts < $2`, [ident(asker), MAX_ATTEMPTS])).rows;
  // Four refused mails in a row, a minute apart: before, the 4th request hit the cap of 3 per email.
  for (let i = 0; i < 4; i++) {
    assert.equal((await mergeFull("u1", `95000${i}`, T0 + i * STEP))[ISSUE_MERGE.gate].length, 1);
    assert.equal((await mergeSendFailed("u1", `95000${i}`))[0].length, 1);
    assert.equal((await mergeUsable("u1")).length, 0); // nothing typed can match: hash gone, attempts spent
  }
  // Inside the minute after a refused mail: still refused (cooldown kept), and the newest own row says `unsent`.
  const mergeSoon = await mergeFull("u1", "950009", T0 + 3 * STEP + 20_000);
  assert.equal(mergeSoon[ISSUE_MERGE.gate].length, 0);
  const newestOwn = mergeSoon[ISSUE_MERGE.rows].filter((r) => r.own === true).sort((a, b) => Number(b.expiresMs) - Number(a.expiresMs))[0];
  assert.equal(newestOwn.unsent, true);
  // Another asker is not on that cooldown, and the refused rows left the per-email cap free.
  assert.equal((await mergeFull("u2", "950010", T0 + 3 * STEP + 21_000))[ISSUE_MERGE.gate].length, 1);
  // A minute later the asker gets a real code that works; SENT codes still cap at 3 per email.
  assert.equal((await mergeFull("u1", "950011", T0 + 4 * STEP))[ISSUE_MERGE.gate].length, 1);
  assert.deepEqual((await mergeUsable("u1")).map((r) => r.token), [sha("950011")]);
  assert.equal((await mergeFull("u3", "950012", T0 + 4 * STEP))[ISSUE_MERGE.gate].length, 1);
  assert.equal((await mergeFull("u4", "950013", T0 + 4 * STEP))[ISSUE_MERGE.gate].length, 0);
  // A refused mail never withdraws a NEWER code of the same asker (scoped by the old hash).
  assert.equal((await mergeSendFailed("u1", "950003"))[0].length, 0);
  assert.equal((await mergeUsable("u1")).length, 1);
  console.log("ok 12 merge refused mail: code dead + out of the per-email cap, cooldown kept (newest own row = unsent), next minute issues; sent codes still cap at 3");

  await pool.end();
  console.log("ALL OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
