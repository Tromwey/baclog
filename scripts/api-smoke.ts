/**
 * Smoke test for /api/v1 (Kura iOS API — ios/API.md). Runs against a LIVE
 * server (local `pnpm dev`, or beta) and validates every response against the
 * wire zod in `src/app/api/v1/_lib/schemas.ts`. Exits 1 on the first failure.
 *
 *   pnpm tsx scripts/api-smoke.ts --base http://localhost:3010/api/v1 \
 *     --email ericbriseno@baclog.app --log /path/to/dev-server.log
 *
 * Flags
 *   --base <url>      API base (default http://localhost:3000/api/v1)
 *   --email <email>   the account to sign in as (OTP flow — no password)
 *   --log <file>      dev-server log to read the OTP from (the dev mailer prints
 *                     `[dev-mailer] OTP para <email>: Tu código de acceso es NNNNNN`)
 *   --code <NNNNNN>   use this code instead of reading the log
 *   --token <jwt>     skip the OTP flow entirely (auth section still runs the
 *                     negative cases + refresh/logout on this token)
 *   --only a,b        run only these sections: auth · reads · writes
 *   --verbose         print every request line
 *
 * Structure: phases 1–2 ADD cases to `reads` / `writes` below (each case is a
 * `{ name, run }` that throws on failure). `reads` must never mutate. `writes`
 * runs only against a disposable QA account (the DB is prod) — it is empty
 * until phase 2 and guarded by `--only writes` on purpose.
 *
 * No AUTH_SECRET in the environment → the "wrong audience" / "expired" cases
 * are skipped with a warning (they need to mint a token locally).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config as loadEnv } from "dotenv";
import { SignJWT } from "jose";
import { z } from "zod";
import {
  AuthSessionSchema,
  ErrorBodySchema,
  MeSchema,
  type Me,
} from "../src/app/api/v1/_lib/schemas";

loadEnv({ path: ".env.local" });

// ---------- args ----------

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const opts = {
  base: (flag("base") ?? "http://localhost:3000/api/v1").replace(/\/$/, ""),
  email: (flag("email") ?? "").trim().toLowerCase(),
  log: flag("log"),
  code: flag("code"),
  token: flag("token"),
  only: (flag("only") ?? "auth,reads")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  verbose: argv.includes("--verbose"),
};

if (!opts.email && !opts.token) {
  console.error("Falta --email (o --token).");
  process.exit(2);
}

// ---------- http ----------

interface Res {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
}

async function call(
  method: string,
  path: string,
  init: { token?: string | null; body?: unknown; raw?: boolean } = {},
): Promise<Res> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${opts.base}${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (opts.verbose) console.log(`   ${method} ${path} → ${res.status}`);
  return { status: res.status, headers: res.headers, body, text };
}

function expectNoStore(res: Res) {
  assert.equal(
    res.headers.get("cache-control"),
    "private, no-store",
    "toda respuesta de v1 lleva Cache-Control: private, no-store",
  );
}

function expectError(res: Res, status: number, code: string) {
  assert.equal(res.status, status, `esperaba ${status}, llegó ${res.status}: ${res.text}`);
  expectNoStore(res);
  const parsed = ErrorBodySchema.parse(res.body);
  assert.equal(parsed.error.code, code);
  return parsed.error;
}

function expectOk<S extends z.ZodTypeAny>(res: Res, status: number, schema: S): z.infer<S> {
  assert.equal(res.status, status, `esperaba ${status}, llegó ${res.status}: ${res.text}`);
  expectNoStore(res);
  return schema.parse(res.body);
}

// ---------- OTP code sources ----------

const OTP_LINE = (email: string) =>
  new RegExp(
    `\\[dev-mailer\\] OTP para ${email.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}: Tu código de acceso es (\\d{6})`,
    "g",
  );

async function lastCodeInLog(file: string, email: string): Promise<{ code: string; count: number } | null> {
  const text = await readFile(file, "utf8").catch(() => "");
  const matches = [...text.matchAll(OTP_LINE(email))];
  const last = matches.at(-1);
  return last ? { code: last[1], count: matches.length } : null;
}

async function waitForNewCode(file: string, email: string, before: number): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const found = await lastCodeInLog(file, email);
    if (found && found.count > before) return found.code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No apareció un OTP nuevo en ${file} en 20 s`);
}

async function askCode(): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(`Código OTP enviado a ${opts.email}: `)).trim();
  rl.close();
  return answer;
}

// ---------- state shared across sections ----------

interface Ctx {
  token: string | null;
  me: Me | null;
}
const ctx: Ctx = { token: opts.token ?? null, me: null };

async function signIn(): Promise<void> {
  const before = opts.log ? (await lastCodeInLog(opts.log, opts.email))?.count ?? 0 : 0;

  const req = await call("POST", "/auth/otp/request", { body: { email: opts.email } });
  let reuseLast = false;
  if (req.status === 429) {
    const err = expectError(req, 429, "rate_limited");
    assert.ok(err.retryAfterSeconds && err.retryAfterSeconds > 0, "429 lleva retryAfterSeconds");
    console.log(`   (cooldown de OTP activo — reutilizo el último código del log)`);
    reuseLast = true;
  } else {
    assert.equal(req.status, 204, `otp/request: esperaba 204, llegó ${req.status}: ${req.text}`);
    expectNoStore(req);
  }

  let code = opts.code;
  if (!code && opts.log) {
    code = reuseLast
      ? (await lastCodeInLog(opts.log, opts.email))?.code
      : await waitForNewCode(opts.log, opts.email, before);
  }
  if (!code) code = await askCode();

  const ver = await call("POST", "/auth/otp/verify", {
    body: {
      email: opts.email,
      code,
      device: { platform: "ios", name: "api-smoke", appVersion: "0.0.0" },
    },
  });
  const session = expectOk(ver, 200, AuthSessionSchema);
  assert.equal(session.user.email, opts.email, "Me.email es la cuenta que entró");
  ctx.token = session.token;
  ctx.me = session.user;
}

// ---------- cases ----------

interface Case {
  name: string;
  run: () => Promise<void>;
}

const auth: Case[] = [
  {
    name: "otp/request rechaza un body inválido con 400 invalid + fields",
    run: async () => {
      const res = await call("POST", "/auth/otp/request", { body: { email: "no-es-correo" } });
      const err = expectError(res, 400, "invalid");
      assert.ok(err.fields && "email" in err.fields, "fields.email presente");
      const notJson = await fetch(`${opts.base}/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(notJson.status, 400);
    },
  },
  {
    name: "otp/request + otp/verify → { token, user: Me }",
    run: async () => {
      if (opts.token) {
        console.log("   (--token: salto el flujo OTP)");
        return;
      }
      await signIn();
    },
  },
  {
    name: "otp/verify con código malo → 401 unauthorized",
    run: async () => {
      // A different, unused email so we don't burn the real account's live
      // code. verifyOtp burns an attempt on the live token for that email —
      // there is none, so this is a pure miss.
      const res = await call("POST", "/auth/otp/verify", {
        body: {
          email: "smoke-nobody@example.invalid",
          code: "000000",
          device: { platform: "ios", name: "api-smoke", appVersion: "0.0.0" },
        },
      });
      expectError(res, 401, "unauthorized");
    },
  },
  {
    name: "sin bearer → 401",
    run: async () => {
      expectError(await call("GET", "/me"), 401, "unauthorized");
      expectError(await call("POST", "/auth/refresh"), 401, "unauthorized");
      expectError(await call("POST", "/auth/logout"), 401, "unauthorized");
    },
  },
  {
    name: "bearer manipulado → 401 (mismo cuerpo que sin bearer)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const [h, p, s] = ctx.token.split(".");
      const flipped = s[0] === "A" ? "B" : "A";
      const tampered = `${h}.${p}.${flipped}${s.slice(1)}`;
      const a = expectError(await call("GET", "/me", { token: tampered }), 401, "unauthorized");
      const b = expectError(await call("GET", "/me"), 401, "unauthorized");
      assert.deepEqual(a, b, "un 401 nunca dice qué falló");
      expectError(await call("GET", "/me", { token: "garbage" }), 401, "unauthorized");
      // Malformed scheme
      const res = await fetch(`${opts.base}/me`, { headers: { Authorization: `Basic ${ctx.token}` } });
      assert.equal(res.status, 401);
    },
  },
  {
    name: "aud distinto / expirado (firmados con AUTH_SECRET) → 401",
    run: async () => {
      const secret = process.env.AUTH_SECRET;
      if (!secret) {
        console.log("   (sin AUTH_SECRET en el entorno — salto los casos de aud/exp)");
        return;
      }
      assert.ok(ctx.me, "hace falta el usuario");
      const key = new TextEncoder().encode(secret);
      const now = Math.floor(Date.now() / 1000);
      const wrongAud = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(ctx.me.id)
        .setAudience("kura-web")
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setJti("smoke")
        .sign(key);
      expectError(await call("GET", "/me", { token: wrongAud }), 401, "unauthorized");
      const expired = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(ctx.me.id)
        .setAudience("kura-ios")
        .setIssuedAt(now - 7200)
        .setExpirationTime(now - 3600)
        .setJti("smoke")
        .sign(key);
      expectError(await call("GET", "/me", { token: expired }), 401, "unauthorized");
      const noSub = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setAudience("kura-ios")
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setJti("smoke")
        .sign(key);
      expectError(await call("GET", "/me", { token: noSub }), 401, "unauthorized");
      const unknownUser = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("00000000-0000-0000-0000-000000000000")
        .setAudience("kura-ios")
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .setJti("smoke")
        .sign(key);
      expectError(await call("GET", "/me", { token: unknownUser }), 401, "unauthorized");
    },
  },
  {
    name: "auth/refresh → token nuevo (jti distinto) con el mismo Me",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("POST", "/auth/refresh", { token: ctx.token });
      const session = expectOk(res, 200, AuthSessionSchema);
      assert.notEqual(session.token, ctx.token, "el refresh rota el token");
      const me = expectOk(await call("GET", "/me", { token: session.token }), 200, MeSchema);
      assert.equal(me.id, session.user.id);
      ctx.token = session.token;
      ctx.me = session.user;
    },
  },
  {
    name: "auth/logout → 204",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("POST", "/auth/logout", { token: ctx.token });
      assert.equal(res.status, 204, `esperaba 204, llegó ${res.status}: ${res.text}`);
      expectNoStore(res);
    },
  },
];

const reads: Case[] = [
  {
    name: "GET /me → Me (sin birthYear, email propio)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/me", { token: ctx.token });
      const me = expectOk(res, 200, MeSchema);
      assert.ok(!("birthYear" in (res.body as object)), "birthYear jamás se serializa");
      assert.ok(!("isAdmin" in (res.body as object)), "isAdmin no viaja al cliente");
      if (opts.email) assert.equal(me.email, opts.email);
      ctx.me = me;
    },
  },
  // Phase 1 adds: collections, titles, me/titles, search, discover, people,
  // feed, recap — READ-ONLY cases only.
];

const writes: Case[] = [
  // Phase 2 adds: collections CRUD, memberships, mark, review, follow, PATCH
  // /me — against a DISPOSABLE QA account (DELETE /me at the end).
];

const sections: Record<string, Case[]> = { auth, reads, writes };

// ---------- runner ----------

async function main() {
  console.log(`api-smoke → ${opts.base} (${opts.email || "token"}) · secciones: ${opts.only.join(", ")}`);
  const needsToken = opts.only.some((s) => s !== "auth");
  if (!opts.only.includes("auth") && needsToken && !ctx.token) {
    console.log("\n[login]");
    await signIn();
    console.log("   ok");
  }
  let ran = 0;
  for (const section of opts.only) {
    const cases = sections[section];
    if (!cases) {
      console.error(`Sección desconocida: ${section}`);
      process.exit(2);
    }
    console.log(`\n[${section}]${cases.length === 0 ? " (sin casos todavía)" : ""}`);
    for (const c of cases) {
      const t0 = Date.now();
      try {
        await c.run();
        console.log(`   ok   ${c.name} (${Date.now() - t0} ms)`);
        ran++;
      } catch (err) {
        console.error(`   FAIL ${c.name}`);
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }
  }
  console.log(`\n${ran} casos ok`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
