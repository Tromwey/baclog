import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { fetchWithTimeout } from "./fetch-with-timeout";

/** A server that accepts the request and never answers `/hang`. */
async function withServer(run: (base: string) => Promise<void>) {
  const server = createServer((req, res) => {
    if (req.url === "/ok") res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test("un upstream que no contesta rechaza al vencer el plazo, no cuelga", async () => {
  await withServer(async (base) => {
    const started = Date.now();
    await assert.rejects(fetchWithTimeout(`${base}/hang`, { timeoutMs: 150 }), { name: "TimeoutError" });
    assert.ok(Date.now() - started < 2000, "tardó más que el plazo");
  });
});

test("una respuesta a tiempo pasa intacta, con su init", async () => {
  await withServer(async (base) => {
    const res = await fetchWithTimeout(`${base}/ok`, { timeoutMs: 2000, headers: { "x-test": "1" } });
    assert.equal(await res.text(), "ok");
  });
});

test("la señal del llamador se combina con el plazo, no se reemplaza", async () => {
  await withServer(async (base) => {
    const ctl = new AbortController();
    const p = fetchWithTimeout(`${base}/hang`, { timeoutMs: 5000, signal: ctl.signal });
    ctl.abort();
    await assert.rejects(p, { name: "AbortError" });
  });
});
