/**
 * What an error may say in a log line. PURE (no imports): the OTP module, the
 * v1 wrapper and the Auth.js config all use it, and `tsx --test` runs it.
 *
 * Why: `console.error(label, err)` prints the WHOLE error. A Drizzle query
 * failure (`DrizzleQueryError`) carries the statement's bound values twice —
 * in `message` ("Failed query: …\nparams: a,b,c") and in `.params` — and on
 * the OTP statements those are the email and the sha256 of a 6-digit code
 * (10^6 candidates: the hash IS the code). Log readers are not the audience
 * for either.
 *
 *   - `errorTag`      — name + code of the error and of its causes, nothing
 *                       else. For the OTP paths.
 *   - `redactedError` — name, code, the message with `params` cut out, and
 *                       the stack FRAMES (never the stack's first line, which
 *                       repeats the message). For the generic 500 line.
 */

const MAX_CAUSES = 4;

function chainOf(err: unknown): unknown[] {
  const chain: unknown[] = [];
  let cur: unknown = err;
  while (cur !== undefined && cur !== null && chain.length < MAX_CAUSES) {
    chain.push(cur);
    cur = typeof cur === "object" ? (cur as { cause?: unknown }).cause : undefined;
  }
  return chain;
}

function nameOf(e: unknown): string {
  if (e instanceof Error) return e.name || "Error";
  return typeof e === "object" && e !== null ? "Object" : typeof e;
}

/** A short alphanumeric `code` (SQLSTATE `23505`, `ECONNRESET`, …) or null —
 *  never free text. */
function codeOf(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const code = (e as { code?: unknown }).code;
  return (typeof code === "string" || typeof code === "number") && /^[A-Za-z0-9_]{1,32}$/.test(String(code))
    ? String(code)
    : null;
}

/** "DrizzleQueryError <- NeonDbError(23505)". */
export function errorTag(err: unknown): string {
  return chainOf(err)
    .map((e) => {
      const code = codeOf(e);
      return code ? `${nameOf(e)}(${code})` : nameOf(e);
    })
    .join(" <- ");
}

/** The message without the bound values Drizzle appends to it. */
export function redactMessage(message: string): string {
  return message.replace(/(^|\n)\s*params:[\s\S]*$/i, "$1params: [redacted]");
}

function framesOf(e: unknown): string[] {
  if (!(e instanceof Error) || typeof e.stack !== "string") return [];
  return e.stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, 12);
}

export function redactedError(err: unknown): string {
  return chainOf(err)
    .map((e, i) => {
      const code = codeOf(e);
      const message = e instanceof Error ? redactMessage(e.message) : typeof e === "string" ? e : "";
      const head = `${i === 0 ? "" : "cause: "}${nameOf(e)}${code ? `(${code})` : ""}${message ? `: ${message}` : ""}`;
      return [head, ...framesOf(e)].join("\n");
    })
    .join("\n");
}
