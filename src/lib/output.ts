import type { z } from "zod";

/**
 * A response that failed its OWN schema. Deliberately not a `ZodError`: the
 * API wrapper (`errorToResponse` in authz/api.ts) reads a `ZodError` as "the
 * caller sent something invalid" → 400 with the field list and no log line.
 * A payload WE built that doesn't match the contract is a server bug: it has
 * to be a logged 500, and the client must not be told its request was wrong
 * (nor be handed our internal field paths).
 */
export class OutputContractError extends Error {
  constructor(label: string, readonly issues: z.core.$ZodIssue[]) {
    super(
      `${label}: the response does not match its schema — ${issues
        .slice(0, 8)
        .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "OutputContractError";
  }
}

/**
 * Validate a response body against its wire schema. Use this — never
 * `schema.parse` — for anything a handler RETURNS; `schema.parse` /
 * `readJson` stay for what the caller SENT.
 */
export function parseOutput<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new OutputContractError(label, r.error.issues);
  return r.data;
}
