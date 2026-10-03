import assert from "node:assert/strict";
import { test } from "node:test";
import { z, ZodError } from "zod";
import { OutputContractError, parseOutput } from "./output";

const Schema = z.object({ status: z.enum(["idle", "done"]), total: z.number().int() });

test("a valid response passes through, parsed", () => {
  assert.deepEqual(parseOutput(Schema, { status: "done", total: 3, extra: 1 }, "X"), { status: "done", total: 3 });
});

test("an invalid RESPONSE is not a ZodError — the API wrapper must not answer 400", () => {
  let err: unknown;
  try {
    parseOutput(Schema, { status: "nope", total: 1.5 }, "ExportState");
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof OutputContractError);
  assert.equal(err instanceof ZodError, false);
  assert.match(err.message, /^ExportState: the response does not match its schema — status: /);
  assert.equal(err.issues.length, 2);
});
