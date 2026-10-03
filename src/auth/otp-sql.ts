import { sql, type SQL } from "drizzle-orm";
import {
  FOREIGN_GUESSES_PER_EMAIL_PER_HOUR,
  ISSUE_WINDOW_MS,
  LOGIN_UNSENT_PER_ORIGIN_PER_HOUR,
  MAX_ATTEMPTS,
  MERGE_CODES_PER_EMAIL_PER_HOUR,
  MERGE_ROW_TTL_MS,
  MERGE_UNSENT_PER_ASKER_PER_HOUR,
  MERGE_UNSENT_TOKEN_PREFIX,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR,
  type IssueCaps,
} from "./otp-policy";

/**
 * The statements of the OTP gates, as data: NO `server-only`, NO `db`. Each
 * builder returns the ordered statements of ONE transaction; `src/auth/otp.ts`
 * runs them with `db.batch` (Neon HTTP: one transaction), and the Postgres
 * harness (`scripts/otp-sql-harness.ts`) renders the SAME objects with
 * `PgDialect` and runs them on a throwaway local database — so what is
 * exercised by hand is the SQL that ships, not a copy of it.
 *
 * Every gate is "lock, then INSERT … SELECT … WHERE <the limits> RETURNING":
 * the insert of the marker / row IS the decision, and everything after it is
 * conditioned on that insert having happened (learnings 2026-09-24-contador-
 * de-intentos-leer-y-luego-escribir, 2026-10-01-cooldown-en-la-fila-que-el-
 * atacante-puede-borrar).
 */

const vt = sql`"verificationToken"`;

/** An instant for a raw `sql` template: the columns are `timestamp` WITHOUT
 *  zone and a bare `Date` is serialized with the process's local offset
 *  (learning 2026-09-02-date-crudo-en-sql-template-pierde-offset). */
function at(ms: number): SQL {
  return sql`${new Date(ms).toISOString()}::timestamp`;
}

/** Rows whose `token` ends in `.<origin>` — the login codes of one origin.
 *  `right`, not LIKE: nothing here is a pattern. */
function codeOfOrigin(alias: SQL, origin: string): SQL {
  const suffix = `.${origin}`;
  return sql`right(${alias}.token, ${suffix.length}) = ${suffix}`;
}

export interface IssueLoginParams {
  /** The normalized email — the code row's identifier. */
  email: string;
  /** `otp-issued:<sha256(email)>`. */
  marker: string;
  /** `otp-unsent:<sha256(email)>` — where a marker moves when its mail
   *  failed (`withdrawUnsentSql`): the cooldown and its own loose cap, out
   *  of the code caps. */
  unsentMarker: string;
  /** `otpOrigin(ip)`. */
  origin: string;
  nonce: string;
  /** sha256 hex of the code. */
  codeHash: string;
  now: number;
  caps: IssueCaps;
}

/** Index of each statement's result in the batch. */
export const ISSUE_LOGIN = { gate: 1, markers: 4, usable: 5 } as const;

export function loginCodeToken(codeHash: string, origin: string): string {
  return `${codeHash}.${origin}`;
}

/** The token of an issuance's marker row. */
export function loginMarkerToken(origin: string, nonce: string): string {
  return `${origin}.${nonce}`;
}

/**
 * Issue a login code:
 *   0. lock the email's marker key;
 *   1. GATE — insert this issuance's marker (`<origin>.<nonce>`, lives an
 *      hour) only if the email is under its global cap, THIS origin is under
 *      its own cap and THIS origin has no marker younger than the cooldown —
 *      sent (`marker`) or unsent (`unsentMarker`) — and fewer than
 *      `LOGIN_UNSENT_PER_ORIGIN_PER_HOUR` live unsent ones;
 *   2. drop THIS origin's previous code — only if (1) inserted. Another
 *      origin's live code is never touched;
 *   3. arm the new code (`<hash>.<origin>`) — only if (1) inserted;
 *   4. the email's live markers (to say how long to wait when refused) —
 *      `expiresMs` is always "issued at + an hour", `unsent` says which rows
 *      are out of the code caps;
 *   5. whether this origin holds a usable code right now (what lets a 429
 *      say "revisa tu correo").
 */
export function issueLoginSql(p: IssueLoginParams): SQL[] {
  const markerToken = loginMarkerToken(p.origin, p.nonce);
  const originPrefix = `${p.origin}.`;
  const live = sql`c.identifier = ${p.marker} and c.expires > ${at(p.now)}`;
  const mine = sql`starts_with(c.token, ${originPrefix})`;
  const thisIssuance = sql`exists (select 1 from ${vt} m where m.identifier = ${p.marker} and m.token = ${markerToken})`;
  return [
    sql`select pg_advisory_xact_lock(hashtext(${p.marker}))`,
    sql`
      insert into ${vt} (identifier, token, expires)
      select ${p.marker}, ${markerToken}, ${at(p.now + ISSUE_WINDOW_MS)}
      where (select count(*) from ${vt} c where ${live}) < ${p.caps.perEmail}
        and (select count(*) from ${vt} c where ${live} and ${mine}) < ${p.caps.perOrigin}
        and not exists (
          select 1 from ${vt} c
          where c.identifier = ${p.marker} and ${mine}
            and c.expires > ${at(p.now + ISSUE_WINDOW_MS - RESEND_COOLDOWN_MS)}
        )
        and not exists (
          select 1 from ${vt} c
          where c.identifier = ${p.unsentMarker} and ${mine}
            and c.expires > ${at(p.now + ISSUE_WINDOW_MS - RESEND_COOLDOWN_MS)}
        )
        and (
          select count(*) from ${vt} c
          where c.identifier = ${p.unsentMarker} and ${mine} and c.expires > ${at(p.now)}
        ) < ${LOGIN_UNSENT_PER_ORIGIN_PER_HOUR}
      returning token
    `,
    sql`delete from ${vt} c where c.identifier = ${p.email} and ${codeOfOrigin(sql`c`, p.origin)} and ${thisIssuance}`,
    sql`
      insert into ${vt} (identifier, token, expires)
      select ${p.email}, ${loginCodeToken(p.codeHash, p.origin)}, ${at(p.now + OTP_TTL_MS)}
      where ${thisIssuance}
    `,
    sql`
      select c.token, (extract(epoch from c.expires) * 1000)::bigint as "expiresMs", false as unsent
      from ${vt} c where ${live}
      union all
      select c.token, (extract(epoch from c.expires) * 1000)::bigint, true
      from ${vt} c where c.identifier = ${p.unsentMarker} and c.expires > ${at(p.now)}
    `,
    sql`
      select 1 as usable from ${vt} c
      where c.identifier = ${p.email} and ${codeOfOrigin(sql`c`, p.origin)}
        and c.attempts < ${MAX_ATTEMPTS} and c.expires > ${at(p.now)}
      limit 1
    `,
  ];
}

export const WITHDRAW_UNSENT = { code: 0, marker: 1 } as const;

/**
 * The mail of an issuance could not be sent (`otp.ts`, after the response):
 *   0. withdraw the code — nobody received it, it must not stay guessable.
 *      `token` scopes the delete to THIS code (a newer one is not ours);
 *   1. give the issuance back: its marker MOVES to the unsent namespace
 *      (same token, same expiry: an hour from the issuance). It stops
 *      counting toward the origin's and the email's code caps at once and
 *      keeps holding the one-a-minute cooldown — so the owner's next request,
 *      a minute after the failed one, issues as if this one had never
 *      happened. What bounds a mailer that keeps refusing is the unsent
 *      namespace's own cap in the gate: `LOGIN_UNSENT_PER_ORIGIN_PER_HOUR`
 *      per (email, origin), not the sixty an hour the cooldown alone allowed.
 * `issuedAt` = the `now` the issuance was armed with.
 *
 * ONLY for a send that certainly did not happen (`mail-failure.ts`
 * `mailCertainlyNotSent`): a timeout may have delivered the code.
 */
export function withdrawUnsentSql(p: {
  email: string;
  marker: string;
  unsentMarker: string;
  origin: string;
  nonce: string;
  codeHash: string;
  issuedAt: number;
}): SQL[] {
  return [
    sql`delete from ${vt} c where c.identifier = ${p.email} and c.token = ${loginCodeToken(p.codeHash, p.origin)}`,
    sql`
      update ${vt} c
      set identifier = ${p.unsentMarker}, expires = ${at(p.issuedAt + ISSUE_WINDOW_MS)}
      where c.identifier = ${p.marker} and c.token = ${loginMarkerToken(p.origin, p.nonce)}
      returning c.token
    `,
  ];
}

/**
 * An OWN-origin guess: spend one attempt of the code THIS origin asked for,
 * check and spend in one statement (only a row that still had an attempt
 * comes back). Zero rows = this origin has no usable code → foreign path.
 */
export function spendOwnAttemptSql(email: string, origin: string, now: number): SQL {
  return sql`
    update ${vt} c set attempts = c.attempts + 1
    where c.identifier = ${email} and ${codeOfOrigin(sql`c`, origin)}
      and c.attempts < ${MAX_ATTEMPTS} and c.expires > ${at(now)}
    returning c.token
  `;
}

export const FOREIGN_GUESS = { gate: 1, code: 2, ownBurned: 3 } as const;

/**
 * A FOREIGN guess (no usable code of its own origin):
 *   0. lock the email's foreign-guess key;
 *   1. GATE — insert this guess's marker (lives an hour) only if fewer than
 *      `FOREIGN_GUESSES_PER_EMAIL_PER_HOUR` are live;
 *   2. the email's NEWEST live code that still has attempts — only if (1)
 *      inserted. Its `attempts` are NOT touched: a stranger's wrong guesses
 *      can never kill the owner's code;
 *   3. whether THIS origin holds a live code whose attempts are spent — what
 *      lets a refusal say "locked" instead of "wrong" (`otp-policy.ts`
 *      `missVerdict`). It reads only the caller's own (email, origin) rows.
 */
export function foreignGuessSql(p: {
  email: string;
  /** `otp-foreign:<sha256(email)>`. */
  marker: string;
  /** `otpOrigin(ip)` of the guesser. */
  origin: string;
  nonce: string;
  now: number;
}): SQL[] {
  const thisGuess = sql`exists (select 1 from ${vt} m where m.identifier = ${p.marker} and m.token = ${p.nonce})`;
  return [
    sql`select pg_advisory_xact_lock(hashtext(${p.marker}))`,
    sql`
      insert into ${vt} (identifier, token, expires)
      select ${p.marker}, ${p.nonce}, ${at(p.now + ISSUE_WINDOW_MS)}
      where (
        select count(*) from ${vt} c
        where c.identifier = ${p.marker} and c.expires > ${at(p.now)}
      ) < ${FOREIGN_GUESSES_PER_EMAIL_PER_HOUR}
      returning token
    `,
    sql`
      select c.token from ${vt} c
      where c.identifier = ${p.email} and c.attempts < ${MAX_ATTEMPTS}
        and c.expires > ${at(p.now)} and ${thisGuess}
      order by c.expires desc
      limit 1
    `,
    sql`
      select 1 as burned from ${vt} c
      where c.identifier = ${p.email} and ${codeOfOrigin(sql`c`, p.origin)}
        and c.attempts >= ${MAX_ATTEMPTS} and c.expires > ${at(p.now)}
      limit 1
    `,
  ];
}

export const REVIEW_GUESS = { gate: 1 } as const;

/**
 * The App Review demo account's guess gate (`otp-policy.ts`
 * `REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR`) — runs BEFORE the own / foreign
 * paths, for every origin alike:
 *   0. lock the email's review-guess key;
 *   1. GATE — reserve a slot (a marker that lives an hour) only if fewer than
 *      the cap are live. No row back = the guess is refused UNCOMPARED.
 * A guess that turns out right gives its slot back (`refundReviewGuessSql`),
 * so only wrong guesses stay counted: the cap is on wrong guesses across all
 * origins, and it is exact under concurrency (the reservation is the count).
 */
export function reviewGuessSql(p: {
  /** `otp-review-guess:<sha256(email)>`. */
  marker: string;
  nonce: string;
  now: number;
}): SQL[] {
  return [
    sql`select pg_advisory_xact_lock(hashtext(${p.marker}))`,
    sql`
      insert into ${vt} (identifier, token, expires)
      select ${p.marker}, ${p.nonce}, ${at(p.now + ISSUE_WINDOW_MS)}
      where (
        select count(*) from ${vt} c
        where c.identifier = ${p.marker} and c.expires > ${at(p.now)}
      ) < ${REVIEW_WRONG_GUESSES_PER_EMAIL_PER_HOUR}
      returning token
    `,
  ];
}

/** The slot of a guess that matched goes back. */
export function refundReviewGuessSql(marker: string, nonce: string): SQL {
  return sql`delete from ${vt} c where c.identifier = ${marker} and c.token = ${nonce}`;
}

export const ISSUE_MERGE = { gate: 1, rows: 3 } as const;

/**
 * Issue a merge code (`merge:<destinationId>:<email>`), one transaction:
 *   0. lock the TARGET email (both limits below read rows of that email);
 *   1. GATE — insert the new row (lives an hour) only if the email has fewer
 *      than `MERGE_CODES_PER_EMAIL_PER_HOUR` live merge rows across every
 *      asker (rows whose mail was refused — `unsent.` tokens — don't count),
 *      this (asker, email) has none younger than the cooldown (sent or not)
 *      AND fewer than `MERGE_UNSENT_PER_ASKER_PER_HOUR` unsent ones;
 *   2. kill this asker's previous codes for the email (attempts spent; the
 *      rows stay until their hour is up — they still count toward the cap) —
 *      only if (1) inserted. So there is ONE usable row per identifier;
 *   3. the email's live merge rows (to say how long to wait when refused);
 *      `unsent` = its mail was refused and its code withdrawn.
 */
export function issueMergeSql(p: {
  /** `merge:<destinationId>:<email>`. */
  identifier: string;
  /** The normalized target email (no `:` — schema-validated). */
  email: string;
  mergePrefix: string;
  codeHash: string;
  now: number;
}): SQL[] {
  const suffix = `:${p.email}`;
  // No LIKE: `_` in an email is a wildcard (same match as scrub.ts).
  const forEmail = sql`starts_with(c.identifier, ${p.mergePrefix}) and right(c.identifier, ${suffix.length}) = ${suffix}`;
  const expires = at(p.now + MERGE_ROW_TTL_MS);
  const unsent = sql`starts_with(c.token, ${MERGE_UNSENT_TOKEN_PREFIX})`;
  return [
    sql`select pg_advisory_xact_lock(hashtext(${`merge-otp:${p.email}`}))`,
    sql`
      insert into ${vt} (identifier, token, expires)
      select ${p.identifier}, ${p.codeHash}, ${expires}
      where (
        select count(*) from ${vt} c where ${forEmail} and not ${unsent} and c.expires > ${at(p.now)}
      ) < ${MERGE_CODES_PER_EMAIL_PER_HOUR}
        and not exists (
          select 1 from ${vt} c
          where c.identifier = ${p.identifier}
            and c.expires > ${at(p.now + MERGE_ROW_TTL_MS - RESEND_COOLDOWN_MS)}
        )
        and (
          select count(*) from ${vt} c
          where c.identifier = ${p.identifier} and ${unsent} and c.expires > ${at(p.now)}
        ) < ${MERGE_UNSENT_PER_ASKER_PER_HOUR}
      on conflict do nothing
      returning token
    `,
    sql`
      update ${vt} c set attempts = ${MAX_ATTEMPTS}
      where c.identifier = ${p.identifier} and c.token <> ${p.codeHash}
        and exists (
          select 1 from ${vt} m
          where m.identifier = ${p.identifier} and m.token = ${p.codeHash} and m.expires = ${expires}
        )
    `,
    sql`
      select (c.identifier = ${p.identifier}) as own,
             (extract(epoch from c.expires) * 1000)::bigint as "expiresMs",
             ${unsent} as unsent
      from ${vt} c where ${forEmail} and c.expires > ${at(p.now)}
    `,
  ];
}

/**
 * The mail of a merge code was REFUSED (`otp.ts`, after the response; only
 * for `mailCertainlyNotSent`) — the merge twin of `withdrawUnsentSql`, on the
 * ONE row a merge issuance has:
 *   - withdraw the code: the hash is replaced by `unsent.<nonce>` and the
 *     attempts are spent — nobody received it, nothing typed can match it;
 *   - give the issuance back: an `unsent.` row is out of the per-email cap
 *     (`issueMergeSql`), so three refused mails are not an hour without merge
 *     codes for that address;
 *   - keep the cooldown: identifier and expiry are untouched.
 * `token = codeHash` scopes it to THIS issuance (a newer code is not ours).
 */
export function withdrawMergeUnsentSql(p: {
  identifier: string;
  codeHash: string;
  nonce: string;
}): SQL {
  return sql`
    update ${vt} c
    set token = ${`${MERGE_UNSENT_TOKEN_PREFIX}${p.nonce}`}, attempts = ${MAX_ATTEMPTS}
    where c.identifier = ${p.identifier} and c.token = ${p.codeHash}
    returning c.token
  `;
}
