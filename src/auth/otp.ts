import "server-only";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { convertOnSignup } from "@/modules/growth/waitlist";
import { assignFounderIfEligible } from "@/modules/growth/founder";
import { HANDOFF_IDENTIFIER_PREFIX } from "@/authz/handoff";
import { errorTag } from "@/authz/safe-log";
import { afterResponse } from "@/lib/after-response";
import { env } from "@/lib/env";
import { sendMergeOtpEmail, sendOtpEmail } from "./mailer";
import { mailCertainlyNotSent } from "./mail-failure";
import {
  ISSUE_WINDOW_MS,
  LOGIN_FOREIGN_MARKER_PREFIX,
  LOGIN_ISSUE_CAPS,
  LOGIN_ISSUE_MARKER_PREFIX,
  LOGIN_REVIEW_GUESS_MARKER_PREFIX,
  LOGIN_UNSENT_MARKER_PREFIX,
  MAX_ATTEMPTS,
  MERGE_ROW_TTL_MS,
  OTP_LENGTH,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  REVIEW_ISSUE_CAPS,
  decideIssue,
  decideMergeIssue,
  isLoginEmailShape,
  missVerdict,
  normalizeOtpEmail,
  originOfMarkerToken,
  otpOrigin,
  parseCodeToken,
  wireRefusal,
  type IssueCaps,
  type IssueRefusal,
} from "./otp-policy";
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
} from "./otp-sql";

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * "Not yet" — a code can't be issued right now. ONE class for every limit on
 * purpose: every caller already answers it with a 429, and a second class
 * would be a 500 in the routes that don't know it.
 *   - `reason` — WIRE reason (`otp-policy.ts` `wireRefusal`): `cooldown` ONLY
 *     when a code was sent to this caller less than a minute ago and is still
 *     usable ("revisa tu correo"); `hourly_cap` for everything else (a cap,
 *     or a cooldown whose code was withdrawn / burned) — the caller must not
 *     claim a code is waiting;
 *   - `retryAfterSeconds` — the real wait.
 */
export class OtpCooldownError extends Error {
  constructor(
    readonly retryAfterSeconds: number = Math.ceil(RESEND_COOLDOWN_MS / 1000),
    readonly reason: IssueRefusal = "hourly_cap",
  ) {
    super("Wait before requesting another code");
    this.name = "OtpCooldownError";
  }
}

/**
 * "No code typed now can work" — the guess was refused, or its code killed,
 * by an ATTEMPT LIMIT (`otp-policy.ts` `missVerdict`), as opposed to a wrong
 * or expired code (`verifyOtp` returns null for those). The callers turn it
 * into their own "locked" answer: Auth.js `authorize` → a `CredentialsSignin`
 * with `code = "locked"`; `POST /api/v1/auth/otp/verify` → 401 with
 * `reason: "locked"`. Carries nothing about the address.
 */
export class OtpLockedError extends Error {
  constructor() {
    super("Too many attempts for this code");
    this.name = "OtpLockedError";
  }
}

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = (res as { rows?: unknown }).rows;
  return Array.isArray(r) ? (r as T[]) : [];
}

/** One transaction (Neon HTTP `db.batch`), results in statement order. */
async function runBatch(statements: SQL[]): Promise<unknown[]> {
  const [first, ...rest] = statements.map((s) => db.execute(s));
  return (await db.batch([first, ...rest])) as unknown[];
}

function emailHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Deletes EVERY expired `verificationToken` row — anyone's OTP and expired
 * web-handoff rows (`handoff:<jti>`) alike. Live rows (`expires >= now`,
 * which includes every still-usable handoff) are never touched. Returns the
 * number of rows removed.
 *
 * Callers: every issue / verify (scheduled AFTER the response —
 * `scheduleSweep` — never on the request's critical path) and the daily cron
 * (`src/app/api/cron/**`), which is what lets the privacy notice promise an
 * unused code is gone "a más tardar al día siguiente" even if nobody signs
 * in for a while. Keep this exact signature — the cron imports it.
 *
 * No gate depends on it having run: every limit counts `expires > now`.
 */
export async function sweepExpiredVerificationTokens(): Promise<number> {
  const deleted = await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expires, new Date()))
    .returning({ identifier: verificationTokens.identifier });
  return deleted.length;
}

/**
 * The sweep is housekeeping, not part of the auth decision: it runs after
 * the response is sent (`afterResponse`), so it adds no latency to asking
 * for or typing a code and a failure can never block either. It used to be
 * awaited first thing in every issue and verify — a full-table DELETE (there
 * is no index on `expires`) in front of each sign-in. Only the error's name
 * and code are logged (`safe-log.ts`).
 */
function scheduleSweep(): void {
  afterResponse("otp sweep", async () => {
    try {
      await sweepExpiredVerificationTokens();
    } catch (err) {
      throw new Error(errorTag(err));
    }
  });
}

/**
 * App Review's demo accounts: the fixed code for `normalized` when it is one
 * of the comma-separated `APP_REVIEW_EMAIL` addresses (all share the one
 * code) and `APP_REVIEW_CODE` is a valid 6-digit code; null
 * otherwise (every other email, or the feature unset / misconfigured). The
 * reviewer can't read our inbox, so `issueOtp` arms this code instead of
 * mailing a random one. It is stored hashed in a normal row, so verification
 * goes through the same code paths as any login (60 s cooldown per origin,
 * single use per issued row) PLUS a gate of its own in `consumeLoginCode`:
 * the code never changes and issuing has no hourly cap, so "5 attempts per
 * issued code" alone was 5 attempts per new origin, without end. Wrong
 * guesses are capped per hour across EVERY origin, in the database
 * (`otp-policy.ts` `REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR`).
 */
function reviewLoginCode(normalized: string): string | null {
  const reviewEmails = (env.APP_REVIEW_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const code = env.APP_REVIEW_CODE?.trim();
  if (!code || !reviewEmails.includes(normalized)) return null;
  if (!/^\d{6}$/.test(code)) {
    console.error("[otp] APP_REVIEW_CODE must be 6 digits; review login disabled");
    return null;
  }
  return code;
}

/**
 * Issues a login code for `email`, asked from `clientAddress` (the TRUSTED
 * client IP — `clientIp(request)`; it only keys budgets, never identity).
 * Everything that decides and arms it is ONE transaction serialized per email
 * by an advisory lock (`issueLoginSql`), so N concurrent requests from one
 * origin leave ONE live code and spend ONE issuance.
 *
 * Budgets are per (email, ORIGIN) with a global ceiling per email
 * (`otp-policy.ts`): a stranger asking for codes for someone's address spends
 * the stranger's five an hour, puts only the stranger on cooldown and
 * replaces only the stranger's code — the owner's live code and the owner's
 * own budget are untouched until the email's global ceiling (15/h, which
 * takes at least three distinct networks to reach).
 *
 * The mail goes out AFTER the response (`afterResponse`), like the merge
 * code's: the demo account sends none, and a response that waited for
 * Resend only when there was a mail to send told anyone with a stopwatch
 * which address is the demo account (the one with the fixed code). Now the
 * request does the same work for every address. If the mail was certainly
 * NOT sent (no API key, or Resend answered with an error —
 * `mailCertainlyNotSent`) the code is deleted again — a code nobody received
 * must not stay guessable — and the issuance is GIVEN BACK
 * (`withdrawUnsentSql`, ronda 4): its marker stops counting toward the code
 * caps and only keeps holding this origin's one-a-minute cooldown (plus the
 * loose cap on refused sends, `LOGIN_UNSENT_PER_ORIGIN_PER_HOUR`). A TIMEOUT
 * or a broken connection is NOT that (ronda 5): Resend may have accepted the
 * mail, so the code stays alive and the issuance stays spent — withdrawing
 * it would leave the person typing a dead code. A send that failed is our failure;
 * it used to cost the owner one of five codes an hour (five failed sends =
 * up to an hour locked out). The caller has already been answered, so it
 * learns on its next request: within the minute that 429 says `hourly_cap`
 * (≤ 60 s), never `cooldown`, because there is no code to go look for;
 * after it, a code is issued as if the failed one had never happened. The
 * failure is logged as the mailer's safe code and nothing else —
 * "MailerError(no_api_key)", "MailerError(resend_403)", "MailerError(timeout)".
 */
export async function issueOtp(email: string, clientAddress: string | null): Promise<void> {
  const normalized = normalizeOtpEmail(email);
  // Never touch a handoff/merge/marker row (see `RESERVED_PREFIXES`): the
  // delete below would otherwise burn it. No real email has that shape.
  if (isReservedIdentifier(normalized) || !isLoginEmailShape(normalized)) return;

  const origin = otpOrigin(clientAddress);
  const reviewCode = reviewLoginCode(normalized);
  const code = reviewCode ?? newCode();
  const codeHash = hashCode(code);
  // The App Review demo account keeps the cooldown but not the hourly
  // ISSUING caps (several reviewers share it, no mail goes out). What bounds
  // guessing its fixed code is the gate in `consumeLoginCode`.
  const caps: IssueCaps = reviewCode ? REVIEW_ISSUE_CAPS : LOGIN_ISSUE_CAPS;

  scheduleSweep();

  const now = Date.now();
  const hash = emailHash(normalized);
  const marker = `${LOGIN_ISSUE_MARKER_PREFIX}${hash}`;
  const unsentMarker = `${LOGIN_UNSENT_MARKER_PREFIX}${hash}`;
  const nonce = randomUUID();
  const results = await runBatch(
    issueLoginSql({ email: normalized, marker, unsentMarker, origin, nonce, codeHash, now, caps }),
  );

  if (rowsOf(results[ISSUE_LOGIN.gate]).length === 0) {
    const issued = rowsOf<{ token: string; expiresMs: string | number; unsent: unknown }>(
      results[ISSUE_LOGIN.markers],
    ).map((r) => ({
      at: Number(r.expiresMs) - ISSUE_WINDOW_MS,
      origin: originOfMarkerToken(r.token),
      unsent: r.unsent === true,
    }));
    const decision = decideIssue(issued, origin, now, caps);
    const usable = rowsOf(results[ISSUE_LOGIN.usable]).length > 0;
    throw decision.ok
      ? new OtpCooldownError()
      : new OtpCooldownError(decision.retryAfterSeconds, wireRefusal(decision.reason, usable));
  }

  // The reviewer already has the code (App Store Connect notes): nothing to
  // mail. Everyone else's goes out after the response — see the doc above.
  if (reviewCode) return;
  afterResponse("otp mail", async () => {
    try {
      await sendOtpEmail(normalized, code);
    } catch (err) {
      // Tags only — a failed statement's params are the email and the code's
      // hash; the mailer's error carries a safe `code` (`mail-failure.ts`).
      if (!mailCertainlyNotSent(err)) {
        // Timeout / broken connection: the mail may be on its way.
        console.error(`[otp] mail outcome unknown: ${errorTag(err)}; code kept, issuance kept`);
        return;
      }
      // Nobody received it: withdraw the code and give the issuance back, in
      // one transaction.
      let outcome = "code withdrawn, issuance refunded";
      try {
        await runBatch(
          withdrawUnsentSql({
            email: normalized,
            marker,
            unsentMarker,
            origin,
            nonce,
            codeHash,
            issuedAt: now,
          }),
        );
      } catch (cleanupErr) {
        outcome = `could NOT withdraw the unsent code (${errorTag(cleanupErr)})`;
      }
      console.error(`[otp] mail not sent: ${errorTag(err)}; ${outcome}`);
    }
  });
}

/** What `verifyOtp` hands back — only what its two callers read (Auth.js
 *  `authorize`: id/email/name; `POST /api/v1/auth/otp/verify`: id/isMinor).
 *  Explicit on purpose: a bare `select()` pulled `birthYear` and every future
 *  column — and a column added to `schema.ts` before its migration is applied
 *  then broke every existing-account sign-in. (The INSERT for a brand-new
 *  account still names every column, as Drizzle does; that one is unavoidable
 *  until the migration lands.) */
const OTP_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  emailVerified: users.emailVerified,
  isMinor: users.isMinor,
};

/**
 * `verificationToken` namespaces that are NOT a login email (the table is
 * shared, and the web form's `email` is free text). The login OTP never
 * issues, reads, burns attempts on, or deletes a row under any of them:
 *   - `handoff:<jti>`            — web handoff (src/authz/handoff.ts)
 *   - `merge:<destId>:<email>`   — merge-accounts code (phase 4g, below)
 *   - `merge-token:<jti>`        — single-use mergeToken (src/authz/merge-token.ts)
 *   - `otp-issued:<sha256>`      — the login code's issuance markers (above)
 *   - `otp-unsent:<sha256>`      — issuance markers whose mail failed (cooldown only)
 *   - `otp-foreign:<sha256>`     — the login code's foreign-guess markers
 *   - `otp-review-guess:<sha256>`— the App Review demo account's guess markers
 */
export const MERGE_OTP_IDENTIFIER_PREFIX = "merge:";
export const MERGE_TOKEN_IDENTIFIER_PREFIX = "merge-token:";
const RESERVED_PREFIXES = [
  HANDOFF_IDENTIFIER_PREFIX,
  MERGE_OTP_IDENTIFIER_PREFIX,
  MERGE_TOKEN_IDENTIFIER_PREFIX,
  LOGIN_ISSUE_MARKER_PREFIX,
  LOGIN_UNSENT_MARKER_PREFIX,
  LOGIN_FOREIGN_MARKER_PREFIX,
  LOGIN_REVIEW_GUESS_MARKER_PREFIX,
];
function isReservedIdentifier(normalized: string): boolean {
  return RESERVED_PREFIXES.some((p) => normalized.startsWith(p));
}

/** Constant-time "is `code` the code behind this stored sha256 hex?". */
function hashMatches(storedHash: string, code: string): boolean {
  const expected = Buffer.from(hashCode(code), "hex");
  const got = Buffer.from(storedHash, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Single winner: `true` only for the caller whose DELETE removed the row. */
async function burnCodeRow(identifier: string, token: string): Promise<boolean> {
  const won = await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
    .returning({ identifier: verificationTokens.identifier });
  return won.length === 1;
}

/**
 * One guess at a LOGIN code, from `origin` (`otp-policy.ts` has the model
 * and the bound; `guessPath` is the pure twin of the two branches):
 *
 *   OWN — this origin asked for a code that still has attempts: ONE atomic
 *   UPDATE spends an attempt of THAT code (never more than its 5, however
 *   many guesses are in flight) and the guess is compared with it alone. A
 *   miss ends here — it does NOT go on to try other origins' codes.
 *
 *   FOREIGN — this origin has no usable code (the owner whose IP changed
 *   between asking and typing; or a stranger): one transaction takes one of
 *   the email's 10 foreign guesses an hour and reads the newest live code,
 *   whose `attempts` it never touches.
 *
 * So nothing a third party types can spend the attempts of the code the
 * owner asked for; what a third party CAN exhaust is the foreign budget,
 * which only matters to an owner whose address changed mid-login.
 *
 * A guess that doesn't sign in is `wrong` or `locked` (`otp-policy.ts`
 * `missVerdict`): `locked` = an attempt limit said no, or this origin's own
 * code has no attempts left — nothing typed now can work.
 */
type GuessOutcome = "match" | "wrong" | "locked";

async function consumeLoginCode(
  normalized: string,
  code: string,
  origin: string,
): Promise<GuessOutcome> {
  scheduleSweep();
  if (reviewLoginCode(normalized) === null) return compareLoginCode(normalized, code, origin);

  // The App Review demo account: a FIXED code, so the guess is gated across
  // every origin before anything is compared (`reviewGuessSql`). A slot is
  // reserved atomically; a wrong guess keeps it for an hour, a right one
  // gives it back (the reviewers' sign-ins cost nothing).
  const marker = `${LOGIN_REVIEW_GUESS_MARKER_PREFIX}${emailHash(normalized)}`;
  const nonce = randomUUID();
  const gate = await runBatch(reviewGuessSql({ marker, nonce, now: Date.now() }));
  if (rowsOf(gate[REVIEW_GUESS.gate]).length === 0) return missVerdict("refused", false);
  const outcome = await compareLoginCode(normalized, code, origin);
  if (outcome === "match") {
    // Best-effort: the code row is already burned — a failed refund must not
    // turn a correct code into a refusal. It only leaves one slot spent.
    try {
      await db.execute(refundReviewGuessSql(marker, nonce));
    } catch (err) {
      console.error(`[otp] review guess refund: ${errorTag(err)}`);
    }
  }
  return outcome;
}

/** The own / foreign comparison itself (see `consumeLoginCode`). */
async function compareLoginCode(
  normalized: string,
  code: string,
  origin: string,
): Promise<GuessOutcome> {
  const now = Date.now();

  const own = rowsOf<{ token: string }>(await db.execute(spendOwnAttemptSql(normalized, origin, now)));
  if (own.length > 0) {
    const match = own.find((r) => hashMatches(parseCodeToken(r.token).hash, code));
    return match && (await burnCodeRow(normalized, match.token)) ? "match" : missVerdict("own", false);
  }

  const results = await runBatch(
    foreignGuessSql({
      email: normalized,
      marker: `${LOGIN_FOREIGN_MARKER_PREFIX}${emailHash(normalized)}`,
      origin,
      nonce: randomUUID(),
      now,
    }),
  );
  const ownBurned = rowsOf(results[FOREIGN_GUESS.ownBurned]).length > 0;
  if (rowsOf(results[FOREIGN_GUESS.gate]).length === 0) return missVerdict("refused", ownBurned);
  const [newest] = rowsOf<{ token: string }>(results[FOREIGN_GUESS.code]);
  const matched =
    !!newest &&
    hashMatches(parseCodeToken(newest.token).hash, code) &&
    (await burnCodeRow(normalized, newest.token));
  return matched ? "match" : missVerdict("foreign", ownBurned);
}

/**
 * The core of the MERGE code check (the login code has its own,
 * `consumeLoginCode`: a merge row is keyed by the asking account, so only
 * that account can spend its attempts). Each guess is ONE atomic statement
 * that both checks the cap and spends an attempt:
 *
 *   UPDATE "verificationToken" SET attempts = attempts + 1
 *   WHERE identifier = $1 AND attempts < 5 AND expires > $liveAfter
 *   RETURNING token
 *
 * Only a row that still had an attempt left comes back, so N parallel
 * guesses can never spend more than the 5 attempts the row has (learning
 * 2026-09-24-contador-de-intentos-leer-y-luego-escribir). The hash is
 * compared in app code with `timingSafeEqual`; on a match, `DELETE … WHERE
 * identifier AND token RETURNING` picks a single winner.
 *
 * `liveAfter`: merge rows live 1 h for the per-email cap but their code only
 * 10 min. A row whose attempts are spent is NEVER deleted here — it stays,
 * dead, until it expires.
 */
async function consumeCode(
  identifier: string,
  code: string,
  { liveAfter }: { liveAfter: Date },
): Promise<boolean> {
  scheduleSweep();
  const spent = await db
    .update(verificationTokens)
    .set({ attempts: sql`${verificationTokens.attempts} + 1` })
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        lt(verificationTokens.attempts, MAX_ATTEMPTS),
        gt(verificationTokens.expires, liveAfter),
      ),
    )
    .returning({ token: verificationTokens.token });

  const match = spent.find((r) => hashMatches(r.token, code));
  return match ? burnCodeRow(identifier, match.token) : false;
}

/**
 * Single-use verification: deletes the token on success, returns the
 * (found-or-created) user. Returns null on mismatch/expiry — Auth.js then
 * refuses the sign-in — and THROWS `OtpLockedError` when the refusal is an
 * attempt limit (this origin's code has no attempts left, or a guess budget
 * is spent): the two callers answer that one differently, so `/verify` can
 * stop saying "revisa el código" about a code that is already dead. Neither
 * outcome depends on whether an account has the address. `clientAddress` = the trusted client IP
 * (`clientIp(request)`): it picks the budget the guess draws on
 * (`consumeLoginCode`). A mailbox faces at most
 * `WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR` (85) guesses an hour, not 10^6.
 */
export async function verifyOtp(email: string, code: string, clientAddress: string | null) {
  // The SAME normalizer `issueOtp` keyed the row with (otp-policy.ts).
  const normalized = normalizeOtpEmail(email);
  // Handoff / merge / marker rows share the table under their own
  // namespaces. An email never has that shape; refusing it here keeps the
  // web form (whose `email` is free text) from ever reading, burning
  // attempts on, or deleting one of them — and a merge code from ever being
  // a login code.
  if (isReservedIdentifier(normalized) || !isLoginEmailShape(normalized)) return null;
  const outcome = await consumeLoginCode(normalized, code, otpOrigin(clientAddress));
  if (outcome === "locked") throw new OtpLockedError();
  if (outcome !== "match") return null;
  return findOrCreateUserByVerifiedEmail(normalized);
}

// ---------- phase 4g: the merge-accounts code ----------

/**
 * Proof #2 that the caller owns ANOTHER Kura account (the merge SOURCE): a
 * 6-digit code mailed to that account's address. Stored under
 * `merge:<destinationId>:<email>` — bound to the account that asked, so it
 * is never a login code (`verifyOtp` refuses the namespace) and a code asked
 * by one account can't be redeemed by another.
 *
 * No existence oracle: a row is written and the SAME cooldown applies
 * whether or not a Kura account has that email (or it is the caller's own);
 * only a real source gets a real code, and it is mailed AFTER the response
 * (the returned `send`, null when there is nothing to mail) so the response
 * time doesn't say which. The decoy row holds a hash of a random code nobody
 * ever sees: verification against it always fails, with the same 422.
 * Two rate limits: one code a minute per (asker, email), and at most
 * `MERGE_CODES_PER_EMAIL_PER_HOUR` per target email across ALL askers
 * (`MergeOtpCapError`) — each with the 5-attempt atomic cap of
 * `consumeCode`.
 *
 * A mail that was certainly NOT sent (ronda 5; same rule as the login code,
 * `mailCertainlyNotSent`) withdraws the code and gives the issuance back
 * (`withdrawMergeUnsentSql`): the row stops counting toward the per-email
 * cap and keeps the cooldown. The 429 inside that minute then says
 * `hourly_cap`, never `cooldown` — there is no code to go look for. Known
 * and accepted: that only happens to a REAL source (a decoy has no mail to
 * fail), so WHILE our mailer is refusing, the cap and that `reason` tell an
 * authenticated caller the address has an account. The alternative was the
 * owner paying our outage with an hour without merge codes and a "revisa tu
 * correo" about a mail that never left.
 */
export function mergeOtpIdentifier(destinationId: string, normalizedEmail: string): string {
  return `${MERGE_OTP_IDENTIFIER_PREFIX}${destinationId}:${normalizedEmail}`;
}

function newCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

export { MERGE_CODES_PER_EMAIL_PER_HOUR } from "./otp-policy";

/** Too many merge codes asked for one email in the last hour. */
export class MergeOtpCapError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many merge codes for this email");
    this.name = "MergeOtpCapError";
  }
}

/**
 * ONE transaction serialized per TARGET email (`issueMergeSql`): the insert
 * of the new row is the gate (cooldown per (asker, email) + the hourly cap
 * per email across askers), and killing the asker's previous code happens
 * only if that insert did — so N concurrent requests leave ONE usable row
 * per identifier and count ONE toward the cap. (It used to be read → read →
 * update → insert: every in-flight request read "no recent row" and each
 * left its own live code with its own 5 attempts.)
 */
export async function issueMergeOtp(
  destinationId: string,
  email: string,
): Promise<{ send: (() => Promise<void>) | null }> {
  const normalized = email.trim().toLowerCase();
  const identifier = mergeOtpIdentifier(destinationId, normalized);
  scheduleSweep();

  // Read-only and outside the gate on purpose: it only picks which hash the
  // row gets (a real code, or a decoy nobody receives).
  const [source] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  const real = !!source && source.id !== destinationId;
  const code = newCode();
  // Decoy: the hash of a code nobody receives (never the real one).
  const codeHash = hashCode(real ? code : newCode());

  const now = Date.now();
  const results = await runBatch(
    issueMergeSql({
      identifier,
      email: normalized,
      mergePrefix: MERGE_OTP_IDENTIFIER_PREFIX,
      codeHash,
      now,
    }),
  );

  if (rowsOf(results[ISSUE_MERGE.gate]).length === 0) {
    // Rows live exactly 1 h, dead or alive, decoy or real — the answer is
    // the same whether or not the account exists (no oracle).
    const rows = rowsOf<{ own: boolean; expiresMs: string | number; unsent: unknown }>(
      results[ISSUE_MERGE.rows],
    ).map((r) => ({
      own: r.own === true,
      at: Number(r.expiresMs) - MERGE_ROW_TTL_MS,
      unsent: r.unsent === true,
    }));
    const own = rows.filter((r) => r.own);
    const decision = decideMergeIssue(
      // The cooldown looks at every own row, sent or not…
      own.map((r) => r.at),
      // …the per-email cap only at the ones whose mail was not refused.
      rows.filter((r) => !r.unsent).map((r) => r.at),
      now,
    );
    if (!decision.ok && decision.reason === "hourly_cap") {
      throw new MergeOtpCapError(Math.max(60, decision.retryAfterSeconds));
    }
    // `cooldown` = "a code was sent a moment ago" — true of a decoy as far as
    // the caller may know. NOT when this asker's newest row is one whose mail
    // was refused: that code was withdrawn, nothing is waiting anywhere.
    const newestOwn = own.reduce<(typeof own)[number] | null>(
      (a, b) => (a === null || b.at > a.at ? b : a),
      null,
    );
    throw new OtpCooldownError(
      decision.ok ? undefined : decision.retryAfterSeconds,
      newestOwn && !newestOwn.unsent ? "cooldown" : "hourly_cap",
    );
  }

  if (!real) return { send: null };
  // Never rejects: the caller schedules it after the response.
  const send = async () => {
    try {
      await sendMergeOtpEmail(normalized, code);
    } catch (err) {
      if (!mailCertainlyNotSent(err)) {
        console.error(`[otp] merge mail outcome unknown: ${errorTag(err)}; code kept, issuance kept`);
        return;
      }
      let outcome = "code withdrawn, issuance refunded";
      try {
        await db.execute(withdrawMergeUnsentSql({ identifier, codeHash, nonce: randomUUID() }));
      } catch (cleanupErr) {
        outcome = `could NOT withdraw the unsent code (${errorTag(cleanupErr)})`;
      }
      console.error(`[otp] merge mail not sent: ${errorTag(err)}; ${outcome}`);
    }
  };
  return { send };
}

/**
 * The merge SOURCE's id when `code` is the live merge code this destination
 * asked for `email` and a Kura account (other than the caller) still has
 * that email; null otherwise — one null for wrong code, expired code, decoy
 * row and missing account (the caller answers ONE 422). Same 5-attempt cap
 * as the login code.
 */
export async function verifyMergeOtp(
  destinationId: string,
  email: string,
  code: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  // The code is good for its first 10 minutes; the row lives an hour.
  const liveAfter = new Date(Date.now() + MERGE_ROW_TTL_MS - OTP_TTL_MS);
  const ok = await consumeCode(mergeOtpIdentifier(destinationId, normalized), code, {
    liveAfter,
  });
  if (!ok) return null;
  const [source] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (!source || source.id === destinationId) return null;
  return source.id;
}

/**
 * The account behind an email that was JUST proven (an OTP typed back, or a
 * provider's `email_verified` identity — `src/auth/social.ts`): the existing
 * row (stamping `emailVerified` if it was never set), or a new one with the
 * one-time sign-up hooks (F3.1 waitlist link, F3.2 founder badge;
 * best-effort — a hook failure never blocks the sign-in). `email` must
 * already be trimmed + lowercased. Returns the explicit `OTP_USER_COLUMNS`,
 * never a bare `select()`.
 *
 * Two concurrent first sign-ins of the same email race on the unique index:
 * the loser's insert is a no-op (`onConflictDoNothing`) and it re-reads the
 * winner's row, so both land on ONE account and only the winner runs hooks.
 */
export async function findOrCreateUserByVerifiedEmail(normalized: string) {
  const [existing] = await db
    .select(OTP_USER_COLUMNS)
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (existing) {
    if (!existing.emailVerified) {
      await db
        .update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({ email: normalized, emailVerified: new Date() })
    .onConflictDoNothing({ target: users.email })
    .returning(OTP_USER_COLUMNS);
  if (!created) {
    const [winner] = await db
      .select(OTP_USER_COLUMNS)
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);
    if (!winner) throw new Error("findOrCreateUserByVerifiedEmail: row vanished after conflict");
    return winner;
  }
  // One-time-at-account-creation hooks (F3.1 waitlist link + F3.2 badge).
  // Best-effort: a failure here must not block sign-in.
  try {
    await assignFounderIfEligible(created.id);
    await convertOnSignup(normalized, created.id);
  } catch (err) {
    // Name/code only: these statements carry the address as a param.
    console.error(`[otp] post-signup hooks failed: ${errorTag(err)}`);
  }
  return created;
}
