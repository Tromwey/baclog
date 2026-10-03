import { createHash } from "node:crypto";
import { networkOf } from "../authz/rate-limit";

/**
 * The login code's limits, PURE (no `server-only`, no DB) so `tsx --test`
 * can run the truth table (`otp-policy.test.ts`). `src/auth/otp.ts` is the
 * only reader; the SQL gates (`otp-sql.ts`) enforce the SAME rules atomically
 * and `decideIssue` turns the rows they read back into a `Retry-After`.
 *
 * Ciclo 2 (2026-10-01): every budget an anonymous third party can spend is
 * keyed by (email, ORIGIN) — origin = the caller's network (`otpOrigin`: the
 * IPv4, or the /64 of an IPv6) — so asking for codes or typing wrong ones
 * from somewhere else no longer locks the mailbox's owner out:
 *
 *   - issuing: one code a minute and `LOGIN_CODES_PER_ORIGIN_PER_HOUR` an
 *     hour per (email, origin); `LOGIN_CODES_PER_EMAIL_PER_HOUR` across ALL
 *     origins (the global ceiling that keeps the guess bound finite);
 *   - ONE live code per (email, origin): a new code replaces only the code
 *     of the origin that asked — never somebody else's;
 *   - guessing: `MAX_ATTEMPTS` per code, and ONLY guesses from the origin
 *     that asked for a code spend that code's attempts. A guess from an
 *     origin with no usable code of its own (the owner whose IP changed
 *     between asking and typing — or a stranger) is a FOREIGN guess: it is
 *     checked against the email's newest live code only, spends none of its
 *     attempts, and draws on `FOREIGN_GUESSES_PER_EMAIL_PER_HOUR`.
 *
 * THE BOUND, per mailbox per rolling hour, whatever the number of origins:
 *   15 codes × 5 own-origin guesses + 10 foreign guesses = 85 guesses, each
 *   against exactly ONE 6-digit code → P(guess) ≤ 85 / 10^6 = 8.5e-5 an hour
 *   (`WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR`). One origin alone: 5 × 5 + 10
 *   = 35. (Before ciclo 2: 25, but any stranger could spend all of it.)
 *
 * Everything is counted on MARKER rows that nothing but the expiry sweep
 * deletes (learning 2026-10-01-cooldown-en-la-fila-que-el-atacante-puede-
 * borrar), never on a row the limited party can remove.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_LENGTH = 6;
/** Min time between two codes for one (email, origin). */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Login codes per (email, origin) per rolling hour. */
export const LOGIN_CODES_PER_ORIGIN_PER_HOUR = 5;
/** Login codes per email per rolling hour, across EVERY origin. */
export const LOGIN_CODES_PER_EMAIL_PER_HOUR = 15;
/** How long an issuance counts toward the hourly caps (= a marker row's life). */
export const ISSUE_WINDOW_MS = 60 * 60 * 1000;
/** Wrong guesses FROM ITS OWN ORIGIN before a code is dead. */
export const MAX_ATTEMPTS = 5;
/** Guesses per email per rolling hour from origins with no usable code of
 *  their own (each checked against the newest live code only). */
export const FOREIGN_GUESSES_PER_EMAIL_PER_HOUR = 10;
/** The brute-force bound: guesses a mailbox can face in any rolling hour. */
export const WORST_CASE_GUESSES_PER_EMAIL_PER_HOUR =
  LOGIN_CODES_PER_EMAIL_PER_HOUR * MAX_ATTEMPTS + FOREIGN_GUESSES_PER_EMAIL_PER_HOUR;

/**
 * The App Review demo account (`APP_REVIEW_EMAIL` + a FIXED `APP_REVIEW_CODE`,
 * `otp.ts` `reviewLoginCode`). Its code never changes, so the bound above —
 * which is "N guesses against ONE code, then the code is a different one" —
 * says nothing about it: every guess, from any origin, in any hour, is a
 * guess at the same six digits. And it has no hourly ISSUING caps (several
 * reviewers share it, no mail is sent), so "5 attempts per issued code" was
 * 5 attempts per NEW ORIGIN — unbounded for anyone with an IPv6 block.
 *
 * Its bound is therefore on the guesses themselves, across EVERY origin, on
 * marker rows in the database: at most `REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR`
 * WRONG guesses are ever compared in a rolling hour. A guess reserves a slot
 * atomically before anything is compared and a CORRECT one gives it back, so
 * the reviewers' own sign-ins cost nothing — App Review never gets near the
 * cap in normal use (it knows the code; a typo costs one slot of twenty).
 * P(guess) ≤ 20 / 10^6 = 2e-5 an hour; sweeping the whole space takes
 * 50,000 hours (≈ 5.7 years) of a saturated cap. What a third party CAN do
 * is spend the twenty and lock the reviewers out until slots age out — the
 * price of a fixed code (rotating `APP_REVIEW_CODE` per submission is the
 * founder's lever).
 */
export const REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR = 20;
/** Marker rows of the demo account's guesses: `token = <nonce>`. */
export const LOGIN_REVIEW_GUESS_MARKER_PREFIX = "otp-review-guess:";

/** The pure twin of `reviewGuessSql`'s gate: may one more guess be compared? */
export function reviewGuessAllowed(reservedThisHour: number): boolean {
  return reservedThisHour < REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR;
}

/** `verificationToken.identifier` namespaces of the marker rows. The suffix
 *  is a sha256 of the email, never the address itself (nothing to scrub when
 *  the account is deleted). Issuance markers: `token = <origin>.<nonce>`;
 *  foreign-guess markers: `token = <nonce>`. */
export const LOGIN_ISSUE_MARKER_PREFIX = "otp-issued:";
export const LOGIN_FOREIGN_MARKER_PREFIX = "otp-foreign:";
/**
 * Where an issuance marker MOVES when its mail could not be sent (ronda 4):
 * `otp-unsent:<sha256(email)>`, same `<origin>.<nonce>` token, same life (an
 * hour from the issuance). A row here still holds the origin's one-a-minute
 * cooldown (a mailer outage must not become a retry storm against it) but
 * counts toward NEITHER code cap (5 per origin, 15 per email): a send that
 * failed is our failure, and it used to cost the owner one of five codes an
 * hour — five failed sends were up to an hour locked out.
 *
 * It has a loose cap OF ITS OWN (ronda 5): `LOGIN_UNSENT_PER_ORIGIN_PER_HOUR`
 * per (email, origin). Without it, an address Resend refuses synchronously
 * was worth 60 issuances an hour per origin — one a minute, each one a call
 * to Resend — forever. Twenty is far above what an honest outage costs one
 * person and a third of what the cooldown alone allowed.
 */
export const LOGIN_UNSENT_MARKER_PREFIX = "otp-unsent:";
/** Issuances whose mail was refused, per (email, origin) per rolling hour. */
export const LOGIN_UNSENT_PER_ORIGIN_PER_HOUR = 20;

/** Width of an origin key (hex chars). */
export const OTP_ORIGIN_LENGTH = 16;

/**
 * The origin key of a client address: 16 hex chars of a sha256, never the IP
 * itself (it ends up in `verificationToken.token`). IPv4 → the address; IPv6
 * → its /64 (one subscriber owns 2^64 addresses: per-address limits would be
 * no limit); an IPv4-mapped IPv6 → the IPv4. Anything else — no trusted
 * header, garbage — is the ONE shared origin "unknown": fail-closed, every
 * such caller shares a single budget.
 */
export function otpOrigin(ip: string | null | undefined): string {
  return createHash("sha256")
    .update(`otp-origin:${networkOf(ip)}`)
    .digest("hex")
    .slice(0, OTP_ORIGIN_LENGTH);
}

// `networkOf` lives with the per-IP limiters (`src/authz/rate-limit.ts`, pure)
// so the OTP origin and every `…-ip` bucket are keyed by the SAME network.
export { networkOf };

/**
 * THE normalization of a login email — the same function when the code is
 * issued (`issueOtp`) and when it is consumed (`verifyOtp`), so the row
 * written and the row looked up can never be keyed differently. Trim +
 * lowercase, nothing else: no Unicode folding (NFKC would map look-alike
 * characters onto someone else's address) — the request routes only accept
 * what zod calls an email, and `isLoginEmailShape` refuses the rest here.
 * Auth.js's Credentials provider hands `authorize` the form body untouched
 * (its `normalizeIdentifier` belongs to the Email provider, which we don't
 * use), so this is the only normalizer on either side.
 */
export function normalizeOtpEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Cheap shape gate for an ALREADY-normalized identifier: printable ASCII, one
 * `@`, no whitespace, no `:` (every reserved namespace of the shared table —
 * `handoff:`, `merge:`, `merge-token:`, `otp-issued:`, `otp-unsent:`,
 * `otp-foreign:`, `otp-review-guess:` — has one), ≤ 254.
 * Not an RFC validator: it only keeps free text from the web form from ever
 * being used as a row key.
 */
export function isLoginEmailShape(normalized: string): boolean {
  if (normalized.length < 3 || normalized.length > 254) return false;
  return /^[\x21-\x39\x3b-\x3f\x41-\x7e]+@[\x21-\x39\x3b-\x3f\x41-\x7e]+$/.test(normalized);
}

export type IssueRefusal = "cooldown" | "hourly_cap";
export type IssueDecision =
  | { ok: true }
  | { ok: false; reason: IssueRefusal; retryAfterSeconds: number };

/** One previous issuance for an email: when, and from which origin (null =
 *  a marker written before origins existed: it counts for the email only). */
export interface Issuance {
  at: number;
  origin: string | null;
  /** The mail of this issuance failed and its code was withdrawn
   *  (`LOGIN_UNSENT_MARKER_PREFIX`): it still holds its origin's cooldown,
   *  it counts toward NO hourly cap. */
  unsent?: boolean;
}

export interface IssueCaps {
  perOrigin: number;
  perEmail: number;
}
export const LOGIN_ISSUE_CAPS: IssueCaps = {
  perOrigin: LOGIN_CODES_PER_ORIGIN_PER_HOUR,
  perEmail: LOGIN_CODES_PER_EMAIL_PER_HOUR,
};

/** Codes the App Review demo account may be issued per rolling hour, across
 *  every origin. High on purpose — several reviewers share the account and no
 *  mail goes out — but FINITE (ronda 4): each issuance writes a marker row
 *  that lives an hour and a code row that lives ten minutes, and with no
 *  ceiling anyone with an IPv6 block could grow `verificationToken` without
 *  end through this one address. Worst case now: 200 markers + 200 codes. */
export const REVIEW_CODES_PER_EMAIL_PER_HOUR = 200;

/** The demo account's issuing caps: the per-origin cooldown stays (so one
 *  origin can't pass 60 an hour anyway) and the only hourly limit is the
 *  global one above. NOT what bounds the guessing — that is
 *  `REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR`. */
export const REVIEW_ISSUE_CAPS: IssueCaps = {
  perOrigin: REVIEW_CODES_PER_EMAIL_PER_HOUR,
  perEmail: REVIEW_CODES_PER_EMAIL_PER_HOUR,
};

/** `<origin>.<nonce>` → origin; a legacy bare nonce → null. */
export function originOfMarkerToken(token: string): string | null {
  const dot = token.indexOf(".");
  return dot === OTP_ORIGIN_LENGTH ? token.slice(0, dot) : null;
}

/** When a slot frees for `cap` given ascending instants (null = free now). */
function capWait(sortedAt: readonly number[], cap: number, now: number): number | null {
  if (sortedAt.length < cap) return null;
  return sortedAt[sortedAt.length - cap] + ISSUE_WINDOW_MS - now;
}

/**
 * May `origin` be issued a new code for this email now? `issued` = the
 * email's previous issuances (every origin); anything older than the window
 * is ignored. Three rules — the cooldown and the hourly cap of THIS origin,
 * and the email's cap across all origins; another origin's issuances count
 * toward the last one ONLY, so a stranger can't put the owner on cooldown
 * nor spend the owner's own five. When several refuse, the LONGEST wait is
 * the one reported. `caps` is a parameter only for the App Review demo
 * account (`REVIEW_ISSUE_CAPS`: one high global cap, same cooldown — its
 * bound is on the guesses, `REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR`).
 * An `unsent` issuance (its mail failed) holds its origin's cooldown and is
 * left out of both code caps; it only counts toward its origin's own loose
 * cap (`LOGIN_UNSENT_PER_ORIGIN_PER_HOUR`).
 */
export function decideIssue(
  issued: readonly Issuance[],
  origin: string,
  now: number,
  caps: IssueCaps = LOGIN_ISSUE_CAPS,
): IssueDecision {
  const live = issued.filter((i) => now - i.at < ISSUE_WINDOW_MS);
  const asc = (list: readonly Issuance[]) => list.map((i) => i.at).sort((a, b) => a - b);
  const counted = live.filter((i) => !i.unsent);
  const all = asc(counted);
  const mine = asc(counted.filter((i) => i.origin === origin));
  // The cooldown looks at EVERY issuance of this origin, sent or not.
  const mineAny = asc(live.filter((i) => i.origin === origin));

  const waits: { reason: IssueRefusal; ms: number }[] = [];
  const emailWait = capWait(all, caps.perEmail, now);
  if (emailWait !== null) waits.push({ reason: "hourly_cap", ms: emailWait });
  const originWait = capWait(mine, caps.perOrigin, now);
  if (originWait !== null) waits.push({ reason: "hourly_cap", ms: originWait });
  const unsentWait = capWait(
    asc(live.filter((i) => i.unsent && i.origin === origin)),
    LOGIN_UNSENT_PER_ORIGIN_PER_HOUR,
    now,
  );
  if (unsentWait !== null) waits.push({ reason: "hourly_cap", ms: unsentWait });
  const newest = mineAny[mineAny.length - 1];
  if (newest !== undefined && now - newest < RESEND_COOLDOWN_MS) {
    waits.push({ reason: "cooldown", ms: newest + RESEND_COOLDOWN_MS - now });
  }
  if (waits.length === 0) return { ok: true };
  const worst = waits.reduce((a, b) => (b.ms > a.ms ? b : a));
  return {
    ok: false,
    reason: worst.reason,
    retryAfterSeconds: Math.max(1, Math.ceil(worst.ms / 1000)),
  };
}

/**
 * What a 429 of `POST …/otp/request` says (the wire `reason`):
 *   - `cooldown`   — a code was sent to this caller less than a minute ago
 *                    AND it is still usable: "revisa tu correo";
 *   - `hourly_cap` — wait `retryAfterSeconds`; there may be NO usable code
 *                    (a cap, or the last code was withdrawn / burned);
 *   - `ip_limit`   — the per-IP request limiter; nothing was sent or looked at.
 * The client rule: only `cooldown` may claim a code is waiting in the inbox.
 */
export type OtpRequestRefusal = IssueRefusal | "ip_limit";

export function wireRefusal(reason: IssueRefusal, codeUsable: boolean): IssueRefusal {
  return reason === "cooldown" && codeUsable ? "cooldown" : "hourly_cap";
}

/**
 * Which budget a guess draws on (the pure twin of `otp-sql.ts`
 * `spendOwnAttemptSql` / `foreignGuessSql`). `codes` = the email's live
 * codes with the origin that asked for each and the attempts already spent.
 *   - `own`     — this origin has a code with attempts left: the guess spends
 *                 one of THAT code's attempts and is compared with it alone;
 *   - `foreign` — it has none: the guess spends a foreign slot and is compared
 *                 with the newest live code that still has attempts;
 *   - `refused` — no foreign slot left (or no live code at all).
 * No path lets origin B change the attempts of origin A's code.
 */
export interface LiveCode {
  origin: string | null;
  attempts: number;
  expires: number;
}
export type GuessPath =
  | { kind: "own"; index: number }
  | { kind: "foreign"; index: number }
  | { kind: "refused" };

export function guessPath(
  codes: readonly LiveCode[],
  origin: string,
  foreignGuessesThisHour: number,
): GuessPath {
  const own = codes.findIndex((c) => c.origin === origin && c.attempts < MAX_ATTEMPTS);
  if (own !== -1) return { kind: "own", index: own };
  if (foreignGuessesThisHour >= FOREIGN_GUESSES_PER_EMAIL_PER_HOUR) return { kind: "refused" };
  let newest = -1;
  codes.forEach((c, i) => {
    if (c.attempts < MAX_ATTEMPTS && (newest === -1 || c.expires > codes[newest].expires)) newest = i;
  });
  return newest === -1 ? { kind: "refused" } : { kind: "foreign", index: newest };
}

/**
 * What a guess that did NOT sign in is told (ronda 4). Until now every
 * refusal was the one uniform "wrong code", so `/verify` kept saying "revisa
 * el código" to someone whose code was already dead — typing it again could
 * never work.
 *   - `wrong`  — the guess was compared and missed, or there is nothing to
 *                compare with (expired, never asked): check the code / ask
 *                for one;
 *   - `locked` — an attempt limit refused or exhausted it: this origin's own
 *                code has spent its `MAX_ATTEMPTS`, or the email's foreign
 *                budget (or the demo account's guess budget) is spent. No
 *                code typed now can work — ask for a new one / wait.
 * NOT an account-existence oracle: every input is a row keyed by (email,
 * origin) that `issueOtp` writes for ANY well-formed address, whether or not
 * an account has it. The caller only ever learns about budgets it can spend
 * itself (its own code's attempts; the per-email foreign budget).
 *
 * `budget` = what the guess drew on: `own` (it spent an attempt of this
 * origin's code and was compared with it), `foreign` (it took a foreign slot;
 * compared with the newest live code, if any) or `refused` (a budget said no
 * and nothing was compared). `ownCodeBurned` = this origin holds a live code
 * whose attempts are spent.
 */
export type GuessMiss = "wrong" | "locked";
export function missVerdict(
  budget: "own" | "foreign" | "refused",
  ownCodeBurned: boolean,
): GuessMiss {
  if (budget === "refused") return "locked";
  if (budget === "own") return "wrong";
  return ownCodeBurned ? "locked" : "wrong";
}

/** `<sha256 hex>.<origin>` → its parts; a legacy bare hash → origin null. */
export function parseCodeToken(token: string): { hash: string; origin: string | null } {
  const dot = token.indexOf(".");
  return dot === -1 ? { hash: token, origin: null } : { hash: token.slice(0, dot), origin: token.slice(dot + 1) };
}

// ---------- merge-accounts code (phase 4g) ----------

/** A merge row lives 1 h (what the per-email cap counts); its code only the
 *  first `OTP_TTL_MS`. */
export const MERGE_ROW_TTL_MS = 60 * 60 * 1000;
/** Merge codes per TARGET email per hour, across every asking account. */
export const MERGE_CODES_PER_EMAIL_PER_HOUR = 3;
/**
 * A merge row whose mail was REFUSED (ronda 5, `withdrawMergeUnsentSql`): its
 * token becomes `unsent.<nonce>` — the code's hash is gone and its attempts
 * are spent, so nothing typed can match it — and it stops counting toward the
 * per-email cap above. The row itself stays for its hour: it still holds the
 * asker's one-a-minute cooldown, and at most
 * `MERGE_UNSENT_PER_ASKER_PER_HOUR` of them fit per (asker, email).
 */
export const MERGE_UNSENT_TOKEN_PREFIX = "unsent.";
export const MERGE_UNSENT_PER_ASKER_PER_HOUR = 20;

/**
 * May this asker be issued a merge code for this email now? `ownIssuedAt` =
 * this (asker, email)'s issuances, `emailIssuedAt` = the email's across every
 * asker (own included). The pure twin of `issueMergeSql`'s gate.
 */
export function decideMergeIssue(
  ownIssuedAt: readonly number[],
  emailIssuedAt: readonly number[],
  now: number,
): IssueDecision {
  const inWindow = (t: number) => now - t < MERGE_ROW_TTL_MS;
  const all = emailIssuedAt.filter(inWindow).sort((a, b) => a - b);
  const newest = Math.max(-Infinity, ...ownIssuedAt.filter(inWindow));
  const waits: { reason: IssueRefusal; ms: number }[] = [];
  if (all.length >= MERGE_CODES_PER_EMAIL_PER_HOUR) {
    waits.push({
      reason: "hourly_cap",
      ms: all[all.length - MERGE_CODES_PER_EMAIL_PER_HOUR] + MERGE_ROW_TTL_MS - now,
    });
  }
  if (now - newest < RESEND_COOLDOWN_MS) {
    waits.push({ reason: "cooldown", ms: newest + RESEND_COOLDOWN_MS - now });
  }
  if (waits.length === 0) return { ok: true };
  const worst = waits.reduce((a, b) => (b.ms > a.ms ? b : a));
  return { ok: false, reason: worst.reason, retryAfterSeconds: Math.max(1, Math.ceil(worst.ms / 1000)) };
}
