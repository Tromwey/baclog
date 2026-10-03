/**
 * What went wrong sending a mail, PURE (no `server-only`): `mailer.ts` throws
 * it, `otp.ts` decides on it, `tsx --test` runs it.
 *
 * `code` is safe to log by construction — a fixed word or `resend_<status>`,
 * never the address, never Resend's response body (which may quote it).
 * `errorTag` (`src/authz/safe-log.ts`) prints it: "MailerError(resend_403)".
 *
 *   - `no_api_key`      — `RESEND_API_KEY` is not set: nothing left the process;
 *   - `resend_<status>` — Resend ANSWERED with a non-2xx: it refused the mail;
 *   - `timeout`         — no answer within the mailer's deadline;
 *   - `network`         — the request broke before an answer was read.
 *
 * `notSent` = we KNOW the mail did not go out (the first two). A timeout or
 * a broken connection says nothing: Resend may have accepted the request and
 * the mail may be on its way — so the caller must not treat the code as
 * undelivered.
 */
export type MailFailureCode = "no_api_key" | "timeout" | "network" | `resend_${number}`;

export class MailerError extends Error {
  readonly code: MailFailureCode;
  readonly notSent: boolean;
  constructor(code: MailFailureCode) {
    super(`mail not sent: ${code}`);
    this.name = "MailerError";
    this.code = code;
    this.notSent = code === "no_api_key" || code.startsWith("resend_");
  }
}

/** `fetch` rejected: an `AbortSignal.timeout` abort is a `TimeoutError`;
 *  anything else is the connection. */
export function fetchFailureCode(err: unknown): "timeout" | "network" {
  const name = typeof err === "object" && err !== null ? (err as { name?: unknown }).name : null;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

/**
 * May a code whose mail failed with `err` be WITHDRAWN (and its issuance
 * given back)? Only when the mail certainly did not go out. Anything else —
 * a timeout, a broken connection, an error we don't recognize — keeps the
 * code alive: withdrawing a code that DID reach the inbox would make the
 * person type a dead code. Costs nothing in safety: the code keeps its
 * attempt cap and its 10 minutes.
 */
export function mailCertainlyNotSent(err: unknown): boolean {
  return err instanceof MailerError && err.notSent;
}
