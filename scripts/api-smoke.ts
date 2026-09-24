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
 *   --grep <text>     run only the cases whose name contains <text> (case-
 *                     insensitive; combines with --only). Cases that hand
 *                     state to each other (e.g. E2) may need their producers.
 *   --verbose         print every request line
 *
 * Structure: phases 1–2 ADD cases to `reads` / `writes` below (each case is a
 * `{ name, run }` that throws on failure). `reads` must never mutate. `writes`
 * runs only against a disposable QA account (the DB is prod) — it is empty
 * until phase 2 and guarded by `--only writes` on purpose.
 *
 * A case that can't run in this environment (no AUTH_SECRET to mint tokens,
 * no private collection on the account, no SMOKE_UPCOMING_TITLE_ID…) calls
 * `skip(reason)`: it is counted as SKIPPED in the summary, never as ok, so a
 * run that silently exercised less than it claims can't read as green.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve as resolvePath, sep as pathSep } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config as loadEnv } from "dotenv";
import { SignJWT } from "jose";
import { z } from "zod";
import {
  AuthSessionSchema,
  CollectionSchema,
  ErrorBodySchema,
  FeedEventSchema,
  MeSchema,
  PersonSchema,
  TitleSchema,
  TitleStateSchema,
  type Me,
} from "../src/app/api/v1/_lib/schemas";
import { ERA_KEY_RE, monthYear } from "../src/modules/backlog/recap-format";
// L2
import {
  IsoDateSchema,
  PublicMarkSchema,
  ReviewSchema,
  SearchResultSchema,
  paginated,
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
  grep: (flag("grep") ?? "").toLowerCase(),
  verbose: argv.includes("--verbose"),
};

/** Thrown by a case that can't run here; the runner counts it as skipped. */
class SkipCase extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SkipCase";
  }
}
function skip(reason: string): never {
  throw new SkipCase(reason);
}

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
  assert.match(
    res.headers.get("x-request-id") ?? "",
    /^[0-9a-f-]{36}$/,
    "toda respuesta de v1 lleva X-Request-Id",
  );
}

function expectError(res: Res, status: number, code: string) {
  assert.equal(res.status, status, `esperaba ${status}, llegó ${res.status}: ${res.text}`);
  expectNoStore(res);
  const parsed = ErrorBodySchema.parse(res.body);
  assert.equal(parsed.error.code, code);
  return parsed.error;
}

/**
 * "The same error" = same status, same code AND the same RAW JSON body, key
 * for key. Compare `res.body`, never what `expectError` returns: that went
 * through zod, which DROPS unknown keys — a 404 that leaked an extra field
 * in only one branch would compare equal. Nothing per-request lives in the
 * body (`X-Request-Id` is a header), so byte-equal bodies are the contract.
 */
function expectSameError(a: Res, b: Res, status: number, code: string, message: string) {
  expectError(a, status, code);
  expectError(b, status, code);
  assert.deepEqual(a.body, b.body, message);
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

// L3 — what crosses between the people/feed cases, and the leak scan.
const l3: { ownPerson: z.infer<typeof PersonSchema> | null } = { ownPerson: null };

/** Keys a cross-user payload must never carry, at ANY depth. `id` is legal
 *  on titles/collections, so the scan also rejects the caller's own user id
 *  appearing as any string value (a Person is keyed by handle, never id). */
const LEAK_KEYS = new Set(["email", "birthYear", "userId", "isAdmin", "preferredService", "isPrivate"]);
/** `allow`: keys legal on THIS payload only — `isPrivate` exists solely on the
 *  caller's own following/followers lists (PersonSchema). */
function assertNoPeopleLeak(body: unknown, path = "$", allow: ReadonlySet<string> = new Set()): void {
  if (Array.isArray(body)) {
    body.forEach((v, i) => assertNoPeopleLeak(v, `${path}[${i}]`, allow));
    return;
  }
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      assert.ok(!LEAK_KEYS.has(k) || allow.has(k), `fuga: ${path}.${k}`);
      assertNoPeopleLeak(v, `${path}.${k}`, allow);
    }
    return;
  }
  if (typeof body === "string" && ctx.me) {
    assert.notEqual(body, ctx.me.id, `fuga: ${path} lleva un id de usuario`);
  }
}

/** Read-only state the `reads` cases hand to each other (ids seen so far). */
const smoke: { collections: z.infer<typeof CollectionSchema>[]; titleIds: string[] } = {
  collections: [],
  titleIds: [],
};

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
      if (opts.token) skip("--token: el flujo OTP no se ejercita");
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
      expectSameError(
        await call("GET", "/me", { token: tampered }),
        await call("GET", "/me"),
        401,
        "unauthorized",
        "un 401 nunca dice qué falló",
      );
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
      if (!secret) skip("sin AUTH_SECRET en el entorno para firmar tokens de aud/exp");
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
    name: "auth/refresh: token fresco → el MISMO token; a < 7 días de exp → uno nuevo",
    run: async () => {
      assert.ok(ctx.token && ctx.me, "hace falta un token");
      // Just issued (30 days ahead): no rotation, same token, fresh Me.
      const res = await call("POST", "/auth/refresh", { token: ctx.token });
      const session = expectOk(res, 200, AuthSessionSchema);
      assert.equal(session.token, ctx.token, "con más de 7 días por delante el refresh devuelve el mismo token");
      assert.equal(session.user.id, ctx.me.id);
      ctx.me = session.user;

      const secret = process.env.AUTH_SECRET;
      if (!secret) skip("sin AUTH_SECRET en el entorno para firmar un token a punto de vencer");
      const key = new TextEncoder().encode(secret);
      const now = Math.floor(Date.now() / 1000);
      const expiring = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(ctx.me.id)
        .setAudience("kura-ios")
        .setIssuedAt(now - 28 * 86400)
        .setExpirationTime(now + 2 * 86400)
        .setJti("smoke-expiring")
        .sign(key);
      const rotated = expectOk(await call("POST", "/auth/refresh", { token: expiring }), 200, AuthSessionSchema);
      assert.notEqual(rotated.token, expiring, "a menos de 7 días el refresh rota el token");
      const payload = JSON.parse(Buffer.from(rotated.token.split(".")[1], "base64url").toString("utf8")) as { exp: number; jti: string };
      assert.ok(payload.exp > now + 29 * 86400, "el token nuevo vive 30 días");
      assert.notEqual(payload.jti, "smoke-expiring", "jti nuevo");
      const me = expectOk(await call("GET", "/me", { token: rotated.token }), 200, MeSchema);
      assert.equal(me.id, ctx.me.id);
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

// L4 — /me/titles + /recap/* (ios/API.md §4). Recap shapes are not in
// `_lib/schemas.ts` (they are composed from Title); mirrored here.
const LibraryEntrySchema = z.object({ titleId: z.string().min(1), state: TitleStateSchema });
const RecapMonthRefSchema = z.object({
  era: z.string().regex(ERA_KEY_RE),
  label: z.string().min(1),
});
const RecapMonthSchema = z.object({
  era: z.string().regex(ERA_KEY_RE),
  label: z.string().min(1),
  stats: z.object({
    completed: z.number().int().nonnegative(),
    obsessions: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
    saved: z.number().int().nonnegative(),
  }),
  top: TitleSchema.nullable(),
  also: z.array(TitleSchema),
});
const l4 = { libraryCount: 0, eras: [] as string[] };

// L2 — /titles/{id}, /search, /discover (ios/API.md §4). The envelopes are
// composed from the wire types; mirrored here.
const TitleDetailResponseSchema = z.object({
  title: TitleSchema,
  state: TitleStateSchema.nullable(),
  following: z.array(z.object({ handle: z.string().min(1), mark: PublicMarkSchema.nullable() })),
  reviews: paginated(ReviewSchema),
  collections: z.array(z.string().min(1)),
});
const DiscoverResponseSchema = z.object({
  recommended: z.array(
    z.object({ title: TitleSchema, reason: z.string().min(1), seedTitleId: z.string().min(1) }),
  ),
  trending: z.array(
    z.object({
      title: TitleSchema,
      saves: z.number().int().positive(),
      people: z.array(z.string().min(1)),
    }),
  ),
  upcoming: z.array(z.object({ title: TitleSchema, releaseDate: IsoDateSchema })),
});
const l2 = { titleIds: [] as string[] };

/** Read-only SQL for cases that need to FIND data (a pre-order album, the
 *  most-reviewed title) or check a cache marker. Null without DATABASE_URL
 *  (the case then skips). Never used to write in `reads`. */
async function smokeSql<T>(query: string, params: unknown[] = []): Promise<T[] | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return (await sql.query(query, params)) as unknown as T[];
}

/** Plausible values for each dynamic segment of the v1 tree. A segment not
 *  listed here fails the sweep on purpose: whoever adds `[newSeg]` decides
 *  what a harmless value for it is. */
const SWEEP_SEGMENTS: Record<string, string> = {
  "[id]": "00000000-0000-4000-8000-000000000000",
  "[titleId]": "00000000-0000-4000-8000-000000000000",
  "[handle]": "eric",
  "[key]": "x",
  "[era]": "2026-08",
};
/** The only v1 routes that are public by design (`withPublicApi`). */
const SWEEP_PUBLIC = /^\/auth\/otp\//;

/**
 * Every (verb, path) of `src/app/api/v1/**\/route.ts` except `auth/otp/*`,
 * read from the TREE — a hand-written list is exactly the one that forgets
 * the route nobody wrapped in `withApi`. Runs from the repo root (like the
 * `.env.local` load above). A route.ts that exports no verb the regex can
 * see fails too (the parser would otherwise skip it silently).
 */
async function v1ProtectedRoutes(): Promise<[string, string][]> {
  const root = resolvePath("src/app/api/v1");
  const files = (await readdir(root, { recursive: true }))
    .filter((f) => f === "route.ts" || f.endsWith(`${pathSep}route.ts`))
    .sort();
  assert.ok(files.length > 0, `no hay route.ts bajo ${root} — corre el smoke desde la raíz del repo`);
  const out: [string, string][] = [];
  for (const file of files) {
    const dir = file.slice(0, -"route.ts".length).split(pathSep).filter(Boolean);
    const path = `/${dir
      .map((seg) => {
        if (!seg.startsWith("[")) return seg;
        const value = SWEEP_SEGMENTS[seg];
        assert.ok(value, `segmento dinámico sin valor de barrido: ${seg} (${file}) — agrégalo a SWEEP_SEGMENTS`);
        return value;
      })
      .join("/")}`;
    if (SWEEP_PUBLIC.test(`${path}/`)) continue;
    const src = await readFile(resolvePath(root, file), "utf8");
    const verbs = [
      ...src.matchAll(/export\s+(?:const|(?:async\s+)?function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
    ].map((m) => m[1]);
    assert.ok(verbs.length > 0, `${file} no exporta ningún verbo reconocible`);
    for (const verb of verbs) out.push([verb, path]);
  }
  return out;
}

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
  // L4
  {
    name: "GET /me/titles → { items: [{ titleId, state: TitleState }] } (una fila por título)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/me/titles", { token: ctx.token });
      const { items } = expectOk(res, 200, z.object({ items: z.array(LibraryEntrySchema) }));
      const ids = new Set<string>();
      for (const it of items) {
        assert.equal(it.titleId, it.state.titleId, "titleId espejo de state.titleId");
        assert.ok(!ids.has(it.titleId), `título repetido en /me/titles: ${it.titleId}`);
        ids.add(it.titleId);
      }
      // Newest first (user_item.addedAt desc) — savedAt never increases down the list.
      for (let i = 1; i < items.length; i++) {
        assert.ok(items[i - 1].state.savedAt >= items[i].state.savedAt, "orden savedAt desc");
      }
      l4.libraryCount = items.length;
    },
  },
  {
    name: "GET /recap/months → { items: [{ era, label }] } (más reciente primero)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/recap/months", { token: ctx.token });
      const { items } = expectOk(res, 200, z.object({ items: z.array(RecapMonthRefSchema) }));
      for (let i = 1; i < items.length; i++) {
        assert.ok(items[i - 1].era > items[i].era, "eras estrictamente descendentes");
      }
      for (const m of items) assert.equal(m.label, monthYear(m.era), "label = monthYear(era)");
      if (l4.libraryCount > 0) assert.ok(items.length > 0, "con biblioteca hay al menos un mes");
      l4.eras = items.map((m) => m.era);
    },
  },
  {
    name: "GET /recap/{era} → { era, label, stats, top, also } (regla de la pantalla web)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const era = l4.eras[0];
      if (!era) skip("la cuenta no tiene meses con actividad");
      const res = await call("GET", `/recap/${era}`, { token: ctx.token });
      const recap = expectOk(res, 200, RecapMonthSchema);
      assert.equal(recap.era, era);
      assert.equal(recap.label, monthYear(era));
      assert.ok(recap.also.length <= 12, "also cap 12");
      if (recap.top) {
        assert.ok(!recap.also.some((t) => t.id === recap.top!.id), "also excluye el top");
      }
      const alsoIds = new Set(recap.also.map((t) => t.id));
      assert.equal(alsoIds.size, recap.also.length, "also sin repetidos");
      assert.ok(
        recap.stats.completed + recap.stats.obsessions + recap.stats.saved + recap.stats.reviews > 0,
        "un mes listado tiene alguna actividad",
      );
      for (const t of recap.also) assert.ok(!("synopsis" in t), "also: Title resumen, sin detalle");
    },
  },
  {
    name: "GET /recap/{era} inválido o sin actividad → 404 not_found",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      for (const bad of ["2026-13", "2026-00", "202608", "agosto", "1999-01"]) {
        expectError(await call("GET", `/recap/${bad}`, { token: ctx.token }), 404, "not_found");
      }
    },
  },
  // L1
  {
    name: "GET /collections → { items: [Collection] } (addedAt desc, cover derivada)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/collections", { token: ctx.token });
      const { items } = expectOk(res, 200, z.object({ items: z.array(CollectionSchema) }));
      for (const c of items) {
        assert.equal(Object.keys(c.addedAt).length, c.titleIds.length, "addedAt cubre cada titleId");
        for (let i = 1; i < c.titleIds.length; i++) {
          assert.ok(
            c.addedAt[c.titleIds[i - 1]] >= c.addedAt[c.titleIds[i]],
            `${c.name}: titleIds en addedAt desc`,
          );
        }
        if (c.coverTitleId) assert.ok(c.titleIds.includes(c.coverTitleId), "coverTitleId es un miembro");
        if (c.titleIds.length === 0) assert.equal(c.coverTitleId, null);
      }
      smoke.collections = items;
    },
  },
  {
    name: "GET /collections/{id} → { collection, titles, states } coherentes",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const first = smoke.collections.find((c) => c.titleIds.length > 0) ?? smoke.collections[0];
      if (!first) skip("la cuenta no tiene colecciones");
      const res = await call("GET", `/collections/${first.id}`, { token: ctx.token });
      const body = expectOk(
        res,
        200,
        z.object({
          collection: CollectionSchema,
          titles: z.array(TitleSchema),
          states: z.record(z.string(), TitleStateSchema),
        }),
      );
      assert.equal(body.collection.id, first.id);
      assert.deepEqual(body.collection.titleIds, first.titleIds, "misma lista que GET /collections");
      assert.deepEqual(
        body.titles.map((t) => t.id),
        first.titleIds,
        "titles en el orden de la colección",
      );
      assert.deepEqual(Object.keys(body.states).sort(), [...first.titleIds].sort(), "un state por título");
      for (const id of first.titleIds) {
        assert.equal(body.states[id].titleId, id);
        assert.ok(
          body.states[id].savedAt <= body.collection.addedAt[id],
          "savedAt (primera membresía) nunca es posterior al addedAt de esta colección",
        );
      }
      smoke.titleIds = first.titleIds;
    },
  },
  {
    name: "GET /collections/{id} ajeno o inexistente → 404 not_found idéntico",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      expectSameError(
        await call("GET", "/collections/00000000-0000-0000-0000-000000000000", { token: ctx.token }),
        await call("GET", "/collections/nope", { token: ctx.token }),
        404,
        "not_found",
        "un 404 nunca dice si existe",
      );
    },
  },
  {
    name: "GET /titles?ids= → resúmenes en el orden pedido; desconocidos omitidos; vacío → []",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const Items = z.object({ items: z.array(TitleSchema) });
      const empty = expectOk(await call("GET", "/titles", { token: ctx.token }), 200, Items);
      assert.deepEqual(empty.items, []);
      const empty2 = expectOk(await call("GET", "/titles?ids=,%20,", { token: ctx.token }), 200, Items);
      assert.deepEqual(empty2.items, []);
      const ids = smoke.titleIds.slice(0, 3);
      const asked = [...ids, "does-not-exist"];
      const res = await call("GET", `/titles?ids=${encodeURIComponent(asked.join(","))}`, { token: ctx.token });
      const { items } = expectOk(res, 200, Items);
      assert.deepEqual(items.map((t) => t.id), ids, "orden pedido, desconocido omitido");
      for (const t of items) assert.ok(!("synopsis" in t), "resumen: sin campos de detalle");
    },
  },
  {
    name: "GET /titles con más de 50 ids → 400 invalid",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const many = Array.from({ length: 51 }, (_, i) => `id-${i}`).join(",");
      const err = expectError(await call("GET", `/titles?ids=${many}`, { token: ctx.token }), 400, "invalid");
      assert.ok(err.fields && "ids" in err.fields, "fields.ids presente");
    },
  },
  // L2
  {
    name: "GET /search?q=dune → { items: [SearchResult] } (id + externalRef siempre)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/search?q=dune", { token: ctx.token });
      const { items } = expectOk(res, 200, z.object({ items: z.array(SearchResultSchema) }));
      assert.ok(items.length > 0, "\"dune\" tiene que dar resultados");
      const formats = new Set(items.map((i) => i.format));
      assert.ok(formats.size >= 2, `kind=all mezcla formatos (llegó: ${[...formats].join(",")})`);
      for (const it of items) {
        assert.ok(it.id, "la búsqueda cachea: id presente");
        assert.ok(it.externalRef, "externalRef presente");
      }
      l2.titleIds = items.map((i) => i.id as string);
      const film = await call("GET", "/search?q=dune&kind=film", { token: ctx.token });
      const only = expectOk(film, 200, z.object({ items: z.array(SearchResultSchema) }));
      assert.ok(only.items.every((i) => i.format === "film"), "kind=film filtra");
    },
  },
  {
    name: "GET /search sin q / kind inválido / q > 100 → 400 invalid + fields",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      let err = expectError(await call("GET", "/search", { token: ctx.token }), 400, "invalid");
      assert.ok(err.fields && "q" in err.fields, "fields.q presente");
      err = expectError(await call("GET", "/search?q=dune&kind=nope", { token: ctx.token }), 400, "invalid");
      assert.ok(err.fields && "kind" in err.fields, "fields.kind presente");
      err = expectError(await call("GET", `/search?q=${"a".repeat(101)}`, { token: ctx.token }), 400, "invalid");
      assert.ok(err.fields && "q" in err.fields, "fields.q presente (max 100)");
      // Whitespace-only trims to empty → invalid, never an upstream call.
      expectError(await call("GET", "/search?q=%20%20", { token: ctx.token }), 400, "invalid");
    },
  },
  {
    name: "GET /titles/{id} → { title (detalle), state, following, reviews, collections }",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      assert.ok(l2.titleIds.length > 0, "necesita ids de /search");
      // A few cached titles from the search, plus (when the library has them)
      // one of each format from the caller's own collections.
      const ids = new Set(l2.titleIds.slice(0, 3));
      const lib = await call("GET", "/me/titles", { token: ctx.token });
      if (lib.status === 200) {
        const { items } = z
          .object({ items: z.array(z.object({ titleId: z.string() })) })
          .parse(lib.body);
        for (const it of items.slice(0, 6)) ids.add(it.titleId);
      }
      let withState = 0;
      for (const id of ids) {
        const res = await call("GET", `/titles/${id}`, { token: ctx.token });
        const d = expectOk(res, 200, TitleDetailResponseSchema);
        assert.equal(d.title.id, id);
        assert.ok("synopsis" in d.title && "detail" in d.title && "release" in d.title, "campos de detalle presentes");
        assert.ok(d.title.counts, "counts presente");
        assert.equal(d.title.watch?.length, 1, "una sola opción de watch");
        const w = d.title.watch![0];
        assert.ok(w.url.includes(`/api/links/resolve?catalogItemId=${id}`), "watch.url apunta al resolver");
        if (d.title.format === "album") {
          assert.equal(w.short, "escuchar");
          assert.ok(w.url.includes("service="), "álbum: el servicio va fijado en la URL");
          assert.ok(Array.isArray(d.title.tracks), "álbum: tracks es lista");
        } else {
          assert.equal(w.short, "ver");
          assert.equal(w.kind, "justwatch");
          assert.deepEqual(d.title.tracks, [], "video: sin pistas");
          assert.equal(d.title.trackCount, null);
        }
        if (d.title.format !== "series") assert.equal(d.title.seriesStatus, null);
        if (d.state) {
          withState++;
          assert.equal(d.state.titleId, id);
          // NOT asserted the other way round: a `user_item` from before the
          // three-level model (July 2026) can have no membership at all, and
          // the handler reports that honestly as `collections: []`.
        } else {
          assert.deepEqual(d.collections, [], "sin estado ⇒ sin colecciones");
        }
        // Own review (if any) is pinned first and is the only one with `hidden`.
        d.reviews.items.forEach((r, i) => {
          assert.equal(r.titleId, id);
          if (i > 0) assert.ok(!("hidden" in r), "solo la reseña propia lleva hidden");
          assert.notEqual(r.authorHandle, "", "authorHandle nunca es \"\" (null = sin handle)");
          const pinnedOwn = i === 0 && d.state?.reviewId === r.id;
          if (!pinnedOwn) assert.ok(r.authorHandle, "una reseña pública siempre tiene handle");
        });
        for (const t of d.title.tracks ?? []) assert.equal(typeof t.available, "boolean", "Track.available booleano");
        if (d.state?.reviewId) {
          assert.equal(d.reviews.items[0]?.id, d.state.reviewId, "la reseña propia va primero");
          assert.ok("hidden" in d.reviews.items[0], "la reseña propia lleva hidden");
        }
        for (const f of d.following) assert.ok(f.handle.length > 0);
        assert.ok(!res.text.includes("\"userId\""), "ningún userId ajeno viaja");
      }
      if (lib.status === 200) assert.ok(withState > 0, "al menos un título de la biblioteca trae state");
    },
  },
  {
    name: "GET /titles/{id} malformado o inexistente → 404 not_found (mismo cuerpo)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      expectSameError(
        await call("GET", "/titles/not-a-uuid", { token: ctx.token }),
        await call("GET", "/titles/00000000-0000-4000-8000-000000000000", { token: ctx.token }),
        404,
        "not_found",
        "malformado e inexistente son el mismo 404",
      );
    },
  },
  // L5 (fase 4a) — Title.detail de película, Track.available, reseñas paginadas.
  {
    name: "GET /titles/{id} de película → detail \"N min\" (runtime de TMDB, persistido en raw una sola vez)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const search = await call("GET", "/search?q=dune&kind=film", { token: ctx.token });
      const { items } = expectOk(search, 200, z.object({ items: z.array(SearchResultSchema) }));
      const film = items.find((h) => h.id && h.externalRef?.source === "tmdb");
      assert.ok(film?.id, "\"dune\" como película tiene que dar un título de TMDB");
      const first = expectOk(await call("GET", `/titles/${film.id}`, { token: ctx.token }), 200, TitleDetailResponseSchema);
      assert.equal(first.title.format, "film");
      assert.match(first.title.detail ?? "", /^\d+ min$/, `detail de película: ${first.title.detail}`);
      // Second view reads it off `raw` (same answer, no second TMDB call needed).
      const again = expectOk(await call("GET", `/titles/${film.id}`, { token: ctx.token }), 200, TitleDetailResponseSchema);
      assert.equal(again.title.detail, first.title.detail);
      const rows = await smokeSql<{ at: string | null; runtime: string | null }>(
        `select raw->>'_film_facts_at' as at, raw->>'runtime' as runtime from catalog_item where id = $1`,
        [film.id],
      );
      if (!rows) skip("sin DATABASE_URL para verificar el marcador en raw");
      assert.ok(rows[0]?.at, "raw lleva _film_facts_at tras la primera vista");
      assert.equal(`${rows[0].runtime} min`, first.title.detail, "detail = raw.runtime");
    },
  },
  {
    name: "GET /titles/{id} de álbum en preventa → Track.available = isStreamable de iTunes",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const rows = await smokeSql<{ id: string; external_id: string }>(
        `select id, external_id from catalog_item where media_type = 'album' and source = 'itunes' and release_date > now() order by release_date limit 5`,
      );
      if (!rows) skip("sin DATABASE_URL para buscar un álbum en preventa");
      if (rows.length === 0) skip("no hay ningún álbum en preventa en el catálogo");
      let checked = 0;
      let unavailable = 0;
      const undecided: string[] = [];
      for (const row of rows) {
        // Ground truth FIRST, straight from iTunes (named track → isStreamable).
        // Only when iTunes itself has nothing can the case not decide.
        let results: { wrapperType?: string; trackName?: string; isStreamable?: boolean }[];
        try {
          const lookup = await fetch(`https://itunes.apple.com/lookup?id=${row.external_id}&entity=song&limit=300`);
          if (!lookup.ok) {
            undecided.push(`${row.external_id}: iTunes ${lookup.status}`);
            continue;
          }
          results = ((await lookup.json()) as { results?: typeof results }).results ?? [];
        } catch (err) {
          undecided.push(`${row.external_id}: iTunes no respondió (${err instanceof Error ? err.message : err})`);
          continue;
        }
        const streamable = new Map(
          results
            .filter((r) => r.wrapperType === "track" && r.trackName)
            .map((r) => [r.trackName as string, r.isStreamable !== false]),
        );
        if (streamable.size === 0) {
          undecided.push(`${row.external_id}: iTunes sin pistas nombradas`);
          continue;
        }
        // iTunes HAS named tracks: from here on, 503 or [] from the API is a bug.
        const res = await call("GET", `/titles/${row.id}`, { token: ctx.token });
        assert.notEqual(res.status, 503, `${row.id}: iTunes tiene ${streamable.size} pistas nombradas y la API respondió 503`);
        const d = expectOk(res, 200, TitleDetailResponseSchema);
        const tracks = d.title.tracks ?? [];
        assert.ok(tracks.length > 0, `${row.id}: iTunes tiene ${streamable.size} pistas nombradas y la API dio tracks: []`);
        let compared = 0;
        for (const t of tracks) {
          assert.ok(!/^track \d+$/i.test(t.name) || t.available, `placeholder "${t.name}" nunca viaja`);
          if (streamable.has(t.name)) {
            assert.equal(t.available, streamable.get(t.name), `${t.name}: available = isStreamable`);
            compared++;
          }
          if (!t.available) unavailable++;
        }
        assert.ok(compared > 0, `${row.id}: ninguna pista de la API coincide por nombre con iTunes (nada verificado)`);
        assert.ok((d.title.trackCount ?? 0) >= tracks.length, "trackCount ≥ pistas listadas");
        checked++;
      }
      if (checked === 0) skip(`ningún álbum en preventa verificable — ${undecided.join("; ")}`);
      if (unavailable === 0) console.log("   (ningún álbum en preventa trae hoy una pista nombrada no disponible: solo forma)");
    },
  },
  {
    name: "GET /titles/{id}/reviews → página 1 = la de GET /titles/{id} sin la propia; página 2 sin repetidos",
    run: async () => {
      assert.ok(ctx.token && ctx.me, "hace falta un token");
      const Page = paginated(ReviewSchema);
      // A title whose ficha shows at least one review by SOMEONE ELSE — on a
      // title with none, every equality below holds trivially ([] == []).
      // Candidates: the most-reviewed titles (DB), then the caller's library
      // via the API; the first whose ficha has others' reviews wins.
      const top = await smokeSql<{ id: string }>(
        `select r.catalog_item_id as id from item_review r join "user" u on u.id = r.user_id
          where u.is_public and u.username is not null and r.hidden_at is null and r.user_id <> $1
          group by 1 order by count(*) desc limit 5`,
        [ctx.me.id],
      );
      const lib = expectOk(
        await call("GET", "/me/titles", { token: ctx.token }),
        200,
        z.object({ items: z.array(z.object({ titleId: z.string() })) }),
      );
      const candidates = [...new Set([...(top ?? []).map((r) => r.id), ...lib.items.map((i) => i.titleId)])].slice(0, 25);
      let id: string | null = null;
      let ficha: z.infer<typeof TitleDetailResponseSchema> | null = null;
      for (const candidate of candidates) {
        const d = expectOk(await call("GET", `/titles/${candidate}`, { token: ctx.token }), 200, TitleDetailResponseSchema);
        if (d.reviews.items.some((r) => r.id !== d.state?.reviewId)) {
          id = candidate;
          ficha = d;
          break;
        }
      }
      if (!id || !ficha) {
        skip(
          `ningún título con reseñas ajenas entre ${candidates.length} candidatos${top ? "" : " (sin DATABASE_URL: solo la biblioteca)"} — nada que paginar`,
        );
      }
      const res = await call("GET", `/titles/${id}/reviews`, { token: ctx.token });
      const page = expectOk(res, 200, Page);
      assertNoPeopleLeak(res.body);
      const ownReviewId = ficha.state?.reviewId;
      const fichaPublic = ficha.reviews.items.filter((r) => r.id !== ownReviewId);
      assert.deepEqual(page.items, fichaPublic, "sin cursor = la primera página de la ficha, sin la reseña propia");
      assert.equal(page.nextCursor, ficha.reviews.nextCursor, "mismo nextCursor que la ficha");
      for (const r of page.items) {
        assert.equal(r.titleId, id);
        assert.ok(r.authorHandle, "reseña pública: handle presente, nunca \"\"");
        assert.notEqual(r.authorHandle, ctx.me.handle, "la reseña propia nunca se repite en la lista");
        assert.ok(!("hidden" in r), "una reseña pública no lleva hidden");
      }
      for (let i = 1; i < page.items.length; i++) {
        assert.ok(page.items[i - 1].createdAt >= page.items[i].createdAt, "createdAt desc");
      }
      const empty = expectOk(await call("GET", `/titles/${id}/reviews?cursor=`, { token: ctx.token }), 200, Page);
      assert.deepEqual(empty, page, "cursor vacío = página 1");
      if (page.nextCursor) {
        const p2 = expectOk(
          await call("GET", `/titles/${id}/reviews?cursor=${encodeURIComponent(page.nextCursor)}`, { token: ctx.token }),
          200,
          Page,
        );
        const seen = new Set(page.items.map((r) => r.id));
        for (const r of p2.items) assert.ok(!seen.has(r.id), "página 2 sin repetidos");
      } else {
        // No real second page in this DB: a well-formed cursor past the end is
        // an empty last page (2000 = the lowest year `decodeCursor` accepts).
        const past = encodeURIComponent(`2000-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000`);
        const tail = expectOk(await call("GET", `/titles/${id}/reviews?cursor=${past}`, { token: ctx.token }), 200, Page);
        assert.deepEqual(tail, { items: [], nextCursor: null }, "cursor más allá del final = página vacía");
      }
    },
  },
  {
    name: "GET /titles/{id}/reviews: cursor corrupto (incl. \"1|x\", año 0000, id no-UUID) → 400 fields.cursor; 404 idéntico; 401",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      // Any real title: these answers don't depend on it having reviews.
      const id = l2.titleIds[0];
      assert.ok(id, "necesita ids de /search");
      // Corrupt cursors — including the two that used to reach Postgres and
      // 500 ("1|x" parses as a Date; year 0000 has no ISO Postgres accepts)
      // and a well-formed instant whose id isn't an `item_review.id` (UUID).
      for (const bad of ["garbage", "1|x", "0000-01-01T00:00:00.000Z|x", "2026-01-01T00:00:00.000Z|x"]) {
        const junk = expectError(
          await call("GET", `/titles/${id}/reviews?cursor=${encodeURIComponent(bad)}`, { token: ctx.token }),
          400,
          "invalid",
        );
        assert.ok(junk.fields && "cursor" in junk.fields, `${bad}: fields.cursor presente`);
      }
      // …while a cursor `encodeCursor` could have emitted (UUID id, year ≥ 2000) is a real page.
      const valid = encodeURIComponent(`2000-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000`);
      expectOk(await call("GET", `/titles/${id}/reviews?cursor=${valid}`, { token: ctx.token }), 200, paginated(ReviewSchema));
      expectSameError(
        await call("GET", "/titles/not-a-uuid/reviews", { token: ctx.token }),
        await call("GET", "/titles/00000000-0000-4000-8000-000000000000/reviews", { token: ctx.token }),
        404,
        "not_found",
        "malformado e inexistente son el mismo 404",
      );
      expectError(await call("GET", `/titles/${id}/reviews`), 401, "unauthorized");
    },
  },
  {
    name: "sin bearer → el MISMO 401 en TODAS las rutas v1 (barrido generado del árbol; ninguna escribe)",
    run: async () => {
      const routes = await v1ProtectedRoutes();
      // Sanity on the walker itself: 44 protected verbs today. Far fewer means
      // the tree scan broke, and a sweep over nothing would pass.
      assert.ok(routes.length >= 40, `el barrido encontró solo ${routes.length} rutas: ¿cambió el árbol o el parser?`);
      const reference = await call("GET", "/me");
      expectError(reference, 401, "unauthorized");
      for (const [method, path] of routes) {
        const res = await call(method, path, method === "GET" || method === "DELETE" ? {} : { body: {} });
        // Anything but this exact 401 = a handler that isn't behind `withApi`.
        expectSameError(res, reference, 401, "unauthorized", `${method} ${path}: mismo 401 (¿falta withApi?)`);
      }
      if (opts.verbose) console.log(`   (${routes.length} rutas barridas)`);
    },
  },
  {
    name: "GET /discover → { recommended, trending, upcoming } (sin motor, sin ids de usuario)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/discover", { token: ctx.token });
      const d = expectOk(res, 200, DiscoverResponseSchema);
      const recIds = d.recommended.map((r) => r.title.id);
      assert.equal(new Set(recIds).size, recIds.length, "recommended sin repetidos");
      for (const r of d.recommended) {
        assert.ok(r.reason.startsWith("Porque te obsesiona "), "kicker en la voz de la página");
        assert.notEqual(r.seedTitleId, r.title.id, "la semilla no se recomienda a sí misma");
      }
      const now = Date.now();
      for (const u of d.upcoming) {
        assert.ok(new Date(u.releaseDate).getTime() > now, "upcoming siempre en el futuro");
      }
      for (let i = 1; i < d.upcoming.length; i++) {
        assert.ok(d.upcoming[i - 1].releaseDate <= d.upcoming[i].releaseDate, "upcoming soonest first");
      }
      for (const t of d.trending) assert.ok(t.people.length <= 3 && t.people.length <= t.saves);
      assert.ok(!res.text.includes("\"userId\""), "ningún userId viaja");
    },
  },
  // L3 — gente + feed (ios/API.md §4 Gente y feed). All READ-ONLY, all on
  // the founder's real account. Every payload here is scanned for the keys a
  // cross-user read must never carry (see `assertNoPeopleLeak`).
  {
    name: "GET /people/{propio} → Person completo, isFollowing=false, sin fugas",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token y un handle propio");
      const res = await call("GET", `/people/${ctx.me.handle}`, { token: ctx.token });
      const person = expectOk(res, 200, PersonSchema);
      assertNoPeopleLeak(res.body);
      assert.equal(person.handle, ctx.me.handle);
      assert.equal(person.isFollowing, false, "el dueño no se sigue a sí mismo");
      assert.deepEqual(person.common, [], "afinidad nula para el dueño");
      assert.equal(person.followers, ctx.me.followers, "mismos seguidores que Me");
      assert.equal(person.stats.obsessed, ctx.me.stats.obsessed, "mismas obsesiones que Me");
      for (const c of person.collections) {
        assert.ok(
          c.coverTitleId === null || c.titleIds.includes(c.coverTitleId),
          "coverTitleId pertenece a titleIds",
        );
      }
      l3.ownPerson = person;
    },
  },
  {
    name: "GET /people/eric → Person de un perfil público ajeno",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("GET", "/people/eric", { token: ctx.token });
      if (res.status === 404) skip("no existe @eric público en esta base");
      const person = expectOk(res, 200, PersonSchema);
      assertNoPeopleLeak(res.body);
      assert.equal(person.handle, "eric");
    },
  },
  {
    name: "GET /people/{inexistente} y /people/{inválido} → 404 idéntico",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const missing = await call("GET", "/people/zz_nadie_por_aqui_404", { token: ctx.token });
      const invalid = await call("GET", "/people/AB", { token: ctx.token });
      expectSameError(missing, invalid, 404, "not_found", "un 404 nunca dice si el handle era inválido, privado o inexistente");
      // A collection under a nonexistent owner is the same 404 too.
      const coll = await call("GET", "/people/zz_nadie_por_aqui_404/collections/nope", { token: ctx.token });
      expectSameError(coll, missing, 404, "not_found", "colección bajo un dueño inexistente: el mismo 404");
    },
  },
  {
    name: "GET /people/{handle}/collections/{id} → collection + titles + states",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token y un handle propio");
      const first = l3.ownPerson?.collections[0];
      if (!first) skip("la cuenta no tiene colecciones en el perfil");
      const res = await call("GET", `/people/${ctx.me.handle}/collections/${first.id}`, { token: ctx.token });
      const body = expectOk(
        res,
        200,
        z.object({
          collection: CollectionSchema,
          titles: z.array(TitleSchema),
          states: z.record(z.string(), TitleStateSchema),
        }),
      );
      assertNoPeopleLeak(res.body);
      assert.equal(body.collection.id, first.id);
      assert.notEqual(body.collection.visibility, "private", "una colección pública nunca viaja como privada");
      assert.deepEqual(body.collection.titleIds, first.titleIds, "mismo orden que el perfil");
      assert.deepEqual(
        Object.keys(body.states).sort(),
        [...body.collection.titleIds].sort(),
        "un state por título",
      );
      assert.equal(body.titles.length, body.collection.titleIds.length);
      // A private or foreign backlog id under a valid handle is the same 404.
      const other = await call("GET", `/people/${ctx.me.handle}/collections/00000000-0000-0000-0000-000000000000`, { token: ctx.token });
      expectError(other, 404, "not_found");
    },
  },
  {
    name: "GET /people/{propio}/collections/{privada} → 404 (una colección privada no existe para nadie)",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token y un handle propio");
      const priv = smoke.collections.find((c) => c.visibility === "private");
      if (!priv) skip("la cuenta no tiene ninguna colección privada");
      const res = await call("GET", `/people/${ctx.me.handle}/collections/${priv.id}`, { token: ctx.token });
      expectSameError(
        res,
        await call("GET", `/people/${ctx.me.handle}/collections/00000000-0000-0000-0000-000000000000`, { token: ctx.token }),
        404,
        "not_found",
        "privada e inexistente son el mismo 404, incluso para su dueño",
      );
      // The owner still sees it through the private route.
      expectOk(await call("GET", `/collections/${priv.id}`, { token: ctx.token }), 200, z.object({ collection: CollectionSchema }));
    },
  },
  {
    name: "solo cookie de Auth.js (sin bearer) → 401; bearer + Cookie basura → 200 (el bearer manda)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const cookie = "authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..garbage; __Secure-authjs.session-token=garbage";
      const onlyCookie = await fetch(`${opts.base}/me`, { headers: { Accept: "application/json", Cookie: cookie } });
      assert.equal(onlyCookie.status, 401, "una cookie nunca autentica en v1");
      const onlyCookieBody = ErrorBodySchema.parse(await onlyCookie.json());
      assert.equal(onlyCookieBody.error.code, "unauthorized");
      const both = await fetch(`${opts.base}/me`, {
        headers: { Accept: "application/json", Cookie: cookie, Authorization: `Bearer ${ctx.token}` },
      });
      assert.equal(both.status, 200, `bearer válido + cookie basura: ${both.status}`);
      const me = MeSchema.parse(await both.json());
      assert.equal(me.id, ctx.me?.id, "el usuario sale del bearer, no de la cookie");
    },
  },
  {
    name: "GET /people/suggestions → { items: [Person] } con why",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token");
      const res = await call("GET", "/people/suggestions", { token: ctx.token });
      const body = expectOk(res, 200, z.object({ items: z.array(PersonSchema) }));
      assertNoPeopleLeak(res.body);
      assert.ok(body.items.length <= 8);
      for (const p of body.items) {
        assert.notEqual(p.handle, ctx.me.handle, "nunca me sugiero a mí mismo");
        assert.equal(p.isFollowing, false, "sugerencias = no seguidos");
        assert.ok(typeof p.why === "string" && p.why.length > 0, "why presente");
      }
    },
  },
  {
    name: "GET /people/search?q=er → Person[]; q corto → []; q largo → 400",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token");
      const res = await call("GET", "/people/search?q=er", { token: ctx.token });
      const body = expectOk(res, 200, z.object({ items: z.array(PersonSchema) }));
      assertNoPeopleLeak(res.body);
      assert.ok(body.items.length <= 20);
      for (const p of body.items) assert.notEqual(p.handle, ctx.me.handle, "el viewer no se busca");
      const short = expectOk(await call("GET", "/people/search?q=e", { token: ctx.token }), 200, z.object({ items: z.array(PersonSchema) }));
      assert.deepEqual(short.items, []);
      const none = expectOk(await call("GET", "/people/search", { token: ctx.token }), 200, z.object({ items: z.array(PersonSchema) }));
      assert.deepEqual(none.items, []);
      const long = await call("GET", `/people/search?q=${"a".repeat(61)}`, { token: ctx.token });
      const err = expectError(long, 400, "invalid");
      assert.ok(err.fields && "q" in err.fields, "fields.q presente");
    },
  },
  {
    name: "GET /me/following · /me/followers → { items, nextCursor, privateCount }",
    run: async () => {
      assert.ok(ctx.token && ctx.me, "hace falta un token");
      const schema = paginated(PersonSchema).extend({ privateCount: z.number().int().nonnegative() });
      // `isPrivate` is legal ONLY on these two own lists (PersonSchema).
      const ownList = new Set(["isPrivate"]);
      const following = await call("GET", "/me/following", { token: ctx.token });
      const f = expectOk(following, 200, schema);
      assertNoPeopleLeak(following.body, "$", ownList);
      for (const p of f.items) {
        assert.equal(p.isFollowing, true, "siguiendo = following:true");
        if (p.isPrivate) {
          assert.equal(p.avatarUrl, null, "un seguido privado viaja sin foto");
          assert.deepEqual(p.hexes, [], "un seguido privado viaja sin colores");
        }
      }
      const followers = await call("GET", "/me/followers", { token: ctx.token });
      const g = expectOk(followers, 200, schema);
      assertNoPeopleLeak(followers.body, "$", ownList);
      assert.ok(
        g.items.length + g.privateCount <= Math.max(ctx.me.followers, g.items.length + g.privateCount),
        "listados + anónimos no exceden el conteo",
      );
      // Garbage cursor → 400 with fields.cursor (a cursor we didn't mint is a client bug).
      const junk = expectError(await call("GET", "/me/following?cursor=garbage", { token: ctx.token }), 400, "invalid");
      assert.ok(junk.fields && "cursor" in junk.fields, "fields.cursor presente");
      expectError(await call("GET", "/me/followers?cursor=garbage", { token: ctx.token }), 400, "invalid");
      // Empty cursor = page 1.
      const empty = expectOk(await call("GET", "/me/following?cursor=", { token: ctx.token }), 200, schema);
      assert.deepEqual(empty.items.map((p) => p.handle), f.items.map((p) => p.handle));
      if (f.nextCursor) {
        const p2 = expectOk(await call("GET", `/me/following?cursor=${encodeURIComponent(f.nextCursor)}`, { token: ctx.token }), 200, schema);
        const seen = new Set(f.items.map((p) => p.handle));
        for (const p of p2.items) assert.ok(!seen.has(p.handle), "página 2 sin repetidos");
      }
    },
  },
  {
    name: "GET /me/onboarding/people → { items: [Person] }",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token");
      const res = await call("GET", "/me/onboarding/people", { token: ctx.token });
      const body = expectOk(res, 200, z.object({ items: z.array(PersonSchema) }));
      assertNoPeopleLeak(res.body);
      assert.ok(body.items.length <= 8);
      for (const p of body.items) assert.notEqual(p.handle, ctx.me.handle);
    },
  },
  {
    name: "GET /feed → { items: [FeedEvent], nextCursor } con paginación keyset",
    run: async () => {
      assert.ok(ctx.token && ctx.me, "hace falta un token");
      const schema = paginated(FeedEventSchema);
      const res = await call("GET", "/feed", { token: ctx.token });
      const page = expectOk(res, 200, schema);
      assertNoPeopleLeak(res.body);
      if (ctx.me.followingCount === 0) {
        assert.deepEqual(page, { items: [], nextCursor: null }, "sin seguidos → feed vacío");
        return;
      }
      const ids = new Set<string>();
      for (const e of page.items) {
        assert.ok(!ids.has(e.id), `evento repetido ${e.id}`);
        ids.add(e.id);
        assert.notEqual(e.kind, "suggest", "el feed no trae suggest; va en /feed/suggestion");
        assert.ok(e.titleId && e.title && e.title.id === e.titleId, "title summary presente");
        assert.equal(e.suggest, null);
        if (e.kind !== "added") {
          assert.equal(e.collectionId, null);
          assert.equal(e.releaseDate, null);
        }
        if (e.kind !== "reviewed") {
          assert.equal(e.reviewId, null);
          assert.equal(e.reviewBody, null);
          assert.equal(e.hasSpoiler, false);
        } else {
          assert.ok(e.reviewId && e.id === `reviewed:${e.reviewId}`, "reviewId = id de la fila");
        }
        if (e.kind === "obsessed") assert.equal(e.mark, "obsessed");
        if (e.kind === "completed") assert.ok(e.mark !== null, "un completed siempre lleva marca (veredicto o completed)");
        if (e.kind === "added") assert.equal(e.mark, null, "un added no lleva marca");
        if (e.releaseDate) assert.ok(new Date(e.releaseDate) > new Date(), "releaseDate solo si aún no sale");
      }
      // Newest first.
      for (let i = 1; i < page.items.length; i++) {
        assert.ok(page.items[i - 1].at >= page.items[i].at, "orden desc por at");
      }
      if (page.nextCursor) {
        const p2 = expectOk(await call("GET", `/feed?cursor=${encodeURIComponent(page.nextCursor)}`, { token: ctx.token }), 200, schema);
        assert.ok(p2.items.length > 0, "el cursor apunta a una página con eventos");
        for (const e of p2.items) assert.ok(!ids.has(e.id), `página 2 repite ${e.id}`);
        const last = page.items.at(-1)!;
        for (const e of p2.items) assert.ok(e.at <= last.at, "página 2 es más vieja");
      }
      for (const bad of ["garbage", "1|x", "0000-01-01T00:00:00.000Z|x"]) {
        const junk = expectError(await call("GET", `/feed?cursor=${encodeURIComponent(bad)}`, { token: ctx.token }), 400, "invalid");
        assert.ok(junk.fields && "cursor" in junk.fields, `${bad}: cursor inválido = 400 con fields.cursor`);
      }
      // The feed's id half is opaque (composite `kind:rowId`): a valid instant
      // with any id is a real (here: past-the-end-ish) page, never a 400/500.
      expectOk(
        await call("GET", `/feed?cursor=${encodeURIComponent("2000-01-01T00:00:00.000Z|x")}`, { token: ctx.token }),
        200,
        paginated(FeedEventSchema),
      );
    },
  },
  {
    name: "GET /feed/suggestion → { event: FeedEvent(suggest) | null }",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta un token");
      const res = await call("GET", "/feed/suggestion", { token: ctx.token });
      const body = expectOk(res, 200, z.object({ event: FeedEventSchema.nullable() }));
      assertNoPeopleLeak(res.body);
      if (!body.event) return;
      assert.equal(body.event.kind, "suggest");
      assert.ok(body.event.suggest && body.event.suggest.reason.length > 0);
      assert.equal(body.event.titleId, null);
      assert.notEqual(body.event.author.handle, ctx.me.handle);
    },
  },
  {
    name: "GET /onboarding/pool?page=1 → { items: [Title], nextPage }; page 99 → 400",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const schema = z.object({ items: z.array(TitleSchema), nextPage: z.number().int().nullable() });
      const res = await call("GET", "/onboarding/pool?page=1", { token: ctx.token });
      const page = expectOk(res, 200, schema);
      assertNoPeopleLeak(res.body);
      assert.ok(page.items.length >= 1, "la página 1 trae al menos un título");
      assert.ok(page.nextPage === null || page.nextPage === 2, "nextPage numérico o null");
      // No `page` = page 1. Only the shape is compared: the pool is assembled
      // from live provider lists (TMDB discover, iTunes charts) whose tail can
      // differ between two calls, so identity is not a contract.
      const dflt = expectOk(await call("GET", "/onboarding/pool", { token: ctx.token }), 200, schema);
      assert.ok(dflt.items.length >= 1, "sin page = página 1 (no vacía)");
      assert.equal(dflt.nextPage, page.nextPage, "sin page = página 1 (mismo nextPage)");
      const err = expectError(await call("GET", "/onboarding/pool?page=99", { token: ctx.token }), 400, "invalid");
      assert.ok(err.fields && "page" in err.fields, "fields.page presente");
      expectError(await call("GET", "/onboarding/pool?page=abc", { token: ctx.token }), 400, "invalid");
    },
  },
];

// E2 — helpers + the ids the collection/membership/mark cases hand to each other.
const e2: {
  picks: string[];
  plain: string;
  spare: z.infer<typeof SearchResultSchema> | null;
  obsesiones: string;
  collection: string;
} = { picks: [], plain: "", spare: null, obsesiones: "", collection: "" };

/**
 * `call` on the QA token, retried after a 429 until the window lets it
 * through (bounded: ≤ 6 retries, ≤ 90 s total). The whole `writes` section
 * runs on ONE QA account inside a couple of minutes and E1+R0+E2+E3 together
 * exceed the 60 writes/min ceiling. ONE retry is not enough: the limiter is a
 * sliding window, `Retry-After` is when the OLDEST write expires — one slot —
 * so a case that bursts several writes hits the ceiling again right after
 * (learning 2026-09-24-smoke-writes-compartido-rebasa-rate-limit-por-usuario).
 */
async function qaCall(method: string, path: string, init: { body?: unknown } = {}): Promise<Res> {
  const deadline = Date.now() + 90_000;
  let res = await call(method, path, { token: ctx.token, ...init });
  for (let attempt = 0; res.status === 429 && attempt < 6 && Date.now() < deadline; attempt++) {
    const err = ErrorBodySchema.parse(res.body).error;
    // At least 2 s: a 1 s Retry-After frees a single slot and the next burst re-trips it.
    const wait = Math.min(60, Math.max(2, err.retryAfterSeconds ?? 5));
    console.log(`   (429 en ${method} ${path} — espero ${wait}s)`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await call(method, path, { token: ctx.token, ...init });
  }
  return res;
}
const e2call = qaCall;

async function e2Search(q: string) {
  const res = await e2call("GET", `/search?q=${encodeURIComponent(q)}`);
  const { items } = expectOk(res, 200, z.object({ items: z.array(SearchResultSchema) }));
  return items.filter((h) => h.id !== null && h.externalRef !== null);
}

async function e2Collections() {
  const res = await e2call("GET", "/collections");
  return expectOk(res, 200, z.object({ items: z.array(CollectionSchema) })).items;
}

async function e2Detail(id: string) {
  const res = await e2call("GET", `/collections/${id}`);
  return expectOk(
    res,
    200,
    z.object({
      collection: CollectionSchema,
      titles: z.array(TitleSchema),
      states: z.record(z.string(), TitleStateSchema),
    }),
  );
}

/** titleId → TitleState off GET /me/titles. */
async function e2Library() {
  const res = await e2call("GET", "/me/titles");
  const { items } = expectOk(res, 200, z.object({ items: z.array(LibraryEntrySchema) }));
  return new Map(items.map((it) => [it.titleId, it.state]));
}

// E3 — helpers for the review cases (state they hand to each other).
const e3: { review: z.infer<typeof ReviewSchema> | null } = { review: null };

/** Same bounded 429 retry as `e2call` (they share one QA account's budget). */
const e3call = qaCall;

/** `--token` mode skips the login, so `ctx.me` is empty: read it once. */
async function e3Me(): Promise<Me> {
  if (!ctx.me) ctx.me = expectOk(await e3call("GET", "/me"), 200, MeSchema);
  return ctx.me;
}

/** One title the QA account reacted to (mark != null) and one it only saved. */
async function e3Titles(): Promise<{ reacted: string; reactedMark: string; plain: string }> {
  const res = await e3call("GET", "/me/titles");
  const { items } = expectOk(res, 200, z.object({ items: z.array(LibraryEntrySchema) }));
  const reacted = items.find((it) => it.state.mark !== null);
  const plain = items.find((it) => it.state.mark === null);
  if (!reacted || !plain) {
    throw new Error(
      "E3 necesita en la biblioteca QA un título CON reacción y otro SIN reacción " +
        "(siembra user_item por SQL o corre los casos E2 antes)",
    );
  }
  return { reacted: reacted.titleId, reactedMark: reacted.state.mark as string, plain: plain.titleId };
}

// ---------- E1 helpers (cuenta · avatar · follow) ----------

/** The app origin (the avatar route lives OUTSIDE /api/v1). */
const e1Origin = opts.base.replace(/\/api\/v1$/, "");
const e1Epoch = Date.now();
/** Shared by the E1 cases: the handle we claim and the avatar key we mint. */
const e1: { handle: string; avatarKey: string | null } = {
  handle: `qaapi${e1Epoch}`,
  avatarKey: null,
};

/** OTP sign-in for a SECOND disposable account (the underage case). */
async function e1SignInAs(email: string): Promise<{ token: string; me: Me }> {
  assert.ok(opts.log, "hace falta --log para leer el OTP de la segunda cuenta");
  const before = (await lastCodeInLog(opts.log, email))?.count ?? 0;
  const req = await call("POST", "/auth/otp/request", { body: { email } });
  assert.equal(req.status, 204, `otp/request(${email}): ${req.status} ${req.text}`);
  const code = await waitForNewCode(opts.log, email, before);
  const ver = await call("POST", "/auth/otp/verify", {
    body: { email, code, device: { platform: "ios", name: "api-smoke", appVersion: "0.0.0" } },
  });
  const session = expectOk(ver, 200, AuthSessionSchema);
  return { token: session.token, me: session.user };
}

/** A request whose body is NOT JSON (raw image bytes or multipart). */
async function e1Send(
  method: string,
  url: string,
  init: { token?: string | null; body?: BodyInit; contentType?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.contentType) headers["Content-Type"] = init.contentType;
  const res = await fetch(url, { method, headers, body: init.body });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (opts.verbose) console.log(`   ${method} ${url} → ${res.status}`);
  return { status: res.status, headers: res.headers, body, text };
}

/** 1×1 transparent PNG — a real file, not just the signature. */
const E1_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
/** RIFF….WEBP header + padding: enough for the magic-byte sniff. */
const E1_WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 "),
  Buffer.alloc(16),
]);
const E1_SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function e1AvatarKeyOf(url: string | null): string {
  const m = /^\/api\/avatar\/([a-f0-9]{32})$/.exec(url ?? "");
  assert.ok(m, `avatarUrl con la forma /api/avatar/{key}: ${url}`);
  return m[1];
}

/**
 * The blocked (underage) account cannot call DELETE /me — its bearer is
 * already refused — so the smoke removes it straight from the DB. Needs
 * DATABASE_URL (loaded from .env.local); the dynamic import keeps the driver
 * out of the script's top-level imports.
 */
async function e1DeleteUserRow(email: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "hace falta DATABASE_URL en el entorno para limpiar la cuenta bloqueada");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  await sql`delete from "user" where email = ${email}`;
}

async function e1CountQaRows(): Promise<number> {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "hace falta DATABASE_URL en el entorno para verificar la limpieza");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const rows = (await sql`select count(*)::int as n from "user" where email like 'qa-api-%'`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

const writes: Case[] = [
  // E1 — cuenta · avatar · follow. Order matters: onboarding first (a fresh
  // account has no name), DELETE /me last. Every case runs as the disposable
  // QA account that `signIn()` created; the underage case signs in a second
  // one and removes it from the DB itself.
  {
    name: "E1 POST /me/onboarding (mayor de edad) → Me con onboardingComplete",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const bad = await call("POST", "/me/onboarding", {
        token: ctx.token,
        body: { name: "", birthYear: 1990 },
      });
      const err = expectError(bad, 400, "invalid");
      assert.ok(err.fields && "name" in err.fields, "fields.name presente");
      const res = await call("POST", "/me/onboarding", {
        token: ctx.token,
        body: { name: "QA API", birthYear: 1990 },
      });
      const me = expectOk(res, 200, MeSchema);
      assert.equal(me.name, "QA API");
      assert.equal(me.onboardingComplete, true);
      assert.ok(!("birthYear" in (res.body as object)), "birthYear jamás se serializa");
      ctx.me = me;
    },
  },
  {
    name: "E1 PATCH /me → Me con los cambios (y 400 en preferredService inválido)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const bad = await call("PATCH", "/me", {
        token: ctx.token,
        body: { preferredService: "napster" },
      });
      const err = expectError(bad, 400, "invalid");
      assert.ok(err.fields && "preferredService" in err.fields, "fields.preferredService presente");
      const res = await call("PATCH", "/me", {
        token: ctx.token,
        body: { name: "QA API dos", preferredService: "tidal", notifyReleases: false, isPublic: false },
      });
      const me = expectOk(res, 200, MeSchema);
      assert.equal(me.name, "QA API dos");
      assert.equal(me.preferredService, "tidal");
      assert.equal(me.notifyReleases, false);
      assert.equal(me.isPublic, false);
      // A field left out is left alone.
      const partial = expectOk(
        await call("PATCH", "/me", { token: ctx.token, body: { notifyReleases: true } }),
        200,
        MeSchema,
      );
      assert.equal(partial.name, "QA API dos");
      assert.equal(partial.preferredService, "tidal");
      assert.equal(partial.notifyReleases, true);
      // Empty patch → no-op, still a Me.
      expectOk(await call("PATCH", "/me", { token: ctx.token, body: {} }), 200, MeSchema);
      ctx.me = partial;
    },
  },
  {
    name: "E1 GET /me/username/check → free · taken · invalid (RESERVED)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const status = async (u: string) => {
        const res = await call("GET", `/me/username/check?u=${encodeURIComponent(u)}`, { token: ctx.token });
        return expectOk(res, 200, z.object({ status: z.enum(["free", "taken", "invalid"]) })).status;
      };
      assert.equal(await status(e1.handle), "free");
      assert.equal(await status(`  ${e1.handle.toUpperCase()} `), "free", "normaliza (trim + lower)");
      assert.equal(await status("ericbriseno"), "taken");
      assert.equal(await status("feed"), "invalid", "RESERVED");
      assert.equal(await status("ab"), "invalid", "muy corto");
      assert.equal(await status("con espacio"), "invalid");
      assert.equal(await status(""), "invalid", "vacío no es 400, es invalid");
    },
  },
  // R0 (fase 4a) — BEFORE the handle is claimed (next case): the own review of
  // an account without a handle carries `authorHandle: null`, never "", both
  // in the PUT and pinned in GET /titles/{id}. Leaves NOTHING behind: E2's
  // picks must still find an account with no collection (so they create
  // "Obsesiones") and an empty library.
  {
    name: "R0 reseña sin handle → authorHandle null en PUT /me/titles/{id}/review y en GET /titles/{id}",
    run: async () => {
      const me = expectOk(await e3call("GET", "/me"), 200, MeSchema);
      assert.equal(me.handle, null, "este caso corre antes de reclamar el handle");
      const hits = await e2Search("dune");
      const film = hits.find((h) => h.format === "film") ?? hits[0];
      assert.ok(film?.id, "\"dune\" tiene que dar un título con id");
      const titleId = film.id;

      const coll = expectOk(
        await e3call("POST", "/collections", { body: { name: "Smoke R0", visibility: "private" } }),
        200,
        CollectionSchema,
      );
      let caseError: unknown = null;
      try {
        expectOk(
          await e3call("PUT", `/collections/${coll.id}/titles/${titleId}`),
          200,
          z.object({ title: TitleSchema, state: TitleStateSchema }),
        );
        const marked = expectOk(
          await e3call("PUT", `/me/titles/${titleId}/mark`, { body: { mark: "liked" } }),
          200,
          TitleStateSchema,
        );
        assert.equal(marked.mark, "liked");

        const put = await e3call("PUT", `/me/titles/${titleId}/review`, {
          body: { body: "Reseña sin handle, smoke R0.", hasSpoiler: false },
        });
        const review = expectOk(put, 200, ReviewSchema);
        assert.strictEqual(review.authorHandle, null, "PUT: sin handle → authorHandle null, nunca \"\"");
        assert.ok(put.text.includes('"authorHandle":null'), "null literal en el JSON");

        const d = expectOk(await e3call("GET", `/titles/${titleId}`), 200, TitleDetailResponseSchema);
        assert.equal(d.state?.reviewId, review.id);
        const pinned = d.reviews.items[0];
        assert.equal(pinned?.id, review.id, "la reseña propia va primero");
        assert.strictEqual(pinned.authorHandle, null, "GET /titles/{id}: authorHandle null, nunca \"\"");
        assert.equal(pinned.hidden, false);

        // The paged list never repeats the own review (pinned above it).
        const rest = expectOk(await e3call("GET", `/titles/${titleId}/reviews`), 200, paginated(ReviewSchema));
        assert.ok(!rest.items.some((r) => r.id === review.id), "GET /titles/{id}/reviews excluye la propia");
      } catch (err) {
        caseError = err;
      }
      // Cleanup ALWAYS runs both DELETEs (DELETE /me/titles drops membership
      // + user_item + review; then the collection) and asserts only AFTER
      // both ran — an assert between them would leave the collection behind.
      // A 404 is "nothing to clean" only when the case failed before creating
      // it; on a passing case both must be 204.
      const cleanupFailures: string[] = [];
      for (const path of [`/me/titles/${titleId}`, `/collections/${coll.id}`]) {
        try {
          const r = await e3call("DELETE", path);
          if (r.status !== 204 && !(caseError && r.status === 404)) cleanupFailures.push(`DELETE ${path} → ${r.status}: ${r.text}`);
        } catch (err) {
          cleanupFailures.push(`DELETE ${path} → ${err instanceof Error ? err.message : err}`);
        }
      }
      if (caseError) {
        // The case's own failure is the headline; a cleanup failure rides on it, never replaces it.
        if (cleanupFailures.length > 0 && caseError instanceof Error) {
          caseError.message += `\n   + además falló la limpieza de R0: ${cleanupFailures.join(" · ")}`;
        }
        throw caseError;
      }
      assert.equal(cleanupFailures.length, 0, `limpieza de R0: ${cleanupFailures.join(" · ")}`);
      assert.deepEqual(await e2Collections(), [], "R0 no deja colecciones (E2 crea \"Obsesiones\")");
      assert.equal((await e2Library()).size, 0, "R0 no deja títulos en la biblioteca");
    },
  },
  {
    name: "E1 PUT /me/username → Me con handle e isPublic=true (F2.17)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const res = await call("PUT", "/me/username", {
        token: ctx.token,
        body: { username: e1.handle.toUpperCase() },
      });
      const me = expectOk(res, 200, MeSchema);
      assert.equal(me.handle, e1.handle, "normalizado a minúsculas");
      assert.equal(me.isPublic, true, "reclamar publica el perfil");
      // Own handle reads as free afterwards.
      const own = await call("GET", `/me/username/check?u=${e1.handle}`, { token: ctx.token });
      assert.equal(expectOk(own, 200, z.object({ status: z.string() })).status, "free");
      ctx.me = me;
    },
  },
  {
    name: "E1 PUT /me/username tomado → 409 conflict reason=taken · reservado → 400",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const taken = await call("PUT", "/me/username", { token: ctx.token, body: { username: "ericbriseno" } });
      const err = expectError(taken, 409, "conflict");
      assert.equal(err.reason, "taken");
      const reserved = await call("PUT", "/me/username", { token: ctx.token, body: { username: "feed" } });
      expectError(reserved, 400, "invalid");
      const missing = await call("PUT", "/me/username", { token: ctx.token, body: {} });
      expectError(missing, 400, "invalid");
      // The failed claims changed nothing.
      const me = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema);
      assert.equal(me.handle, e1.handle);
    },
  },
  {
    name: "E1 PUT /me/avatar (raw PNG · multipart WebP) → Me.avatarUrl · SVG → 400",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const url = `${opts.base}/me/avatar`;
      // Raw body with an image Content-Type.
      const png = await e1Send("PUT", url, { token: ctx.token, body: E1_PNG, contentType: "image/png" });
      const me1 = expectOk(png, 200, MeSchema);
      const key1 = e1AvatarKeyOf(me1.avatarUrl);
      // Multipart with a `file` part — a new key every upload.
      const form = new FormData();
      form.append("file", new Blob([E1_WEBP], { type: "image/webp" }), "a.webp");
      const webp = await e1Send("PUT", url, { token: ctx.token, body: form });
      const me2 = expectOk(webp, 200, MeSchema);
      const key2 = e1AvatarKeyOf(me2.avatarUrl);
      assert.notEqual(key2, key1, "la key rota en cada subida");
      e1.avatarKey = key2;
      // SVG never — whatever the declared type says.
      expectError(
        await e1Send("PUT", url, { token: ctx.token, body: E1_SVG, contentType: "image/png" }),
        400,
        "invalid",
      );
      expectError(
        await e1Send("PUT", url, { token: ctx.token, body: E1_SVG, contentType: "image/svg+xml" }),
        400,
        "invalid",
      );
      const svgForm = new FormData();
      svgForm.append("file", new Blob([E1_SVG], { type: "image/svg+xml" }), "a.svg");
      expectError(await e1Send("PUT", url, { token: ctx.token, body: svgForm }), 400, "invalid");
      // Over the cap.
      const big = Buffer.concat([E1_PNG, Buffer.alloc(400 * 1024)]);
      expectError(
        await e1Send("PUT", url, { token: ctx.token, body: big, contentType: "image/png" }),
        400,
        "invalid",
      );
      // Empty body.
      expectError(
        await e1Send("PUT", url, { token: ctx.token, body: Buffer.alloc(0), contentType: "image/png" }),
        400,
        "invalid",
      );
      // The failed uploads did not move the pointer.
      const me = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema);
      assert.equal(e1AvatarKeyOf(me.avatarUrl), key2);
      // The old key is dead.
      const old = await fetch(`${e1Origin}/api/avatar/${key1}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
      assert.equal(old.status, 404, "la key anterior ya no sirve");
      ctx.me = me;
    },
  },
  {
    name: "E1 GET /api/avatar/{key} con bearer → 200 (privado: solo el dueño; público: cualquiera)",
    run: async () => {
      assert.ok(ctx.token && e1.avatarKey, "hace falta token y key");
      const url = `${e1Origin}/api/avatar/${e1.avatarKey}`;
      // Owner is PUBLIC (claimed a handle): anyone with the URL.
      const anon = await fetch(url);
      assert.equal(anon.status, 200, `público sin credencial: ${anon.status}`);
      // Go private: only the owner's bearer.
      expectOk(await call("PATCH", "/me", { token: ctx.token, body: { isPublic: false } }), 200, MeSchema);
      const anonPriv = await fetch(url);
      assert.equal(anonPriv.status, 404, "privado sin credencial → 404");
      const bearer = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
      assert.equal(bearer.status, 200, `privado con bearer del dueño → 200: ${bearer.status}`);
      assert.equal(bearer.headers.get("content-type"), "image/webp");
      assert.equal(bearer.headers.get("cache-control"), "private, max-age=31536000, immutable");
      assert.equal(bearer.headers.get("x-content-type-options"), "nosniff");
      const [h, p, s] = ctx.token.split(".");
      const tampered = `${h}.${p}.${s[0] === "A" ? "B" : "A"}${s.slice(1)}`;
      const bad = await fetch(url, { headers: { Authorization: `Bearer ${tampered}` } });
      assert.equal(bad.status, 404, "bearer manipulado → mismo 404");
      const bogus = await fetch(`${e1Origin}/api/avatar/${"0".repeat(32)}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
      assert.equal(bogus.status, 404);
      // Back to public for the follow cases.
      expectOk(await call("PATCH", "/me", { token: ctx.token, body: { isPublic: true } }), 200, MeSchema);
    },
  },
  {
    name: "E1 DELETE /me/avatar → Me.avatarUrl=null y la key muere",
    run: async () => {
      assert.ok(ctx.token && e1.avatarKey, "hace falta token y key");
      const me = expectOk(await call("DELETE", "/me/avatar", { token: ctx.token }), 200, MeSchema);
      assert.equal(me.avatarUrl, null);
      const gone = await fetch(`${e1Origin}/api/avatar/${e1.avatarKey}`, { headers: { Authorization: `Bearer ${ctx.token}` } });
      assert.equal(gone.status, 404);
      // Idempotent.
      expectOk(await call("DELETE", "/me/avatar", { token: ctx.token }), 200, MeSchema);
      ctx.me = me;
    },
  },
  {
    name: "E1 PUT /me/following/eric → 204 (idempotente) · propio/inexistente/malformado → 404 idéntico",
    run: async () => {
      assert.ok(ctx.token && ctx.me?.handle, "hace falta token y handle");
      const before = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema).followingCount;
      const put = await call("PUT", "/me/following/eric", { token: ctx.token });
      assert.equal(put.status, 204, `esperaba 204, llegó ${put.status}: ${put.text}`);
      expectNoStore(put);
      const again = await call("PUT", "/me/following/eric", { token: ctx.token });
      assert.equal(again.status, 204, "seguir dos veces es una fila");
      const after = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema).followingCount;
      assert.equal(after, before + 1);
      // Own handle, nonexistent and (indistinguishably) private → the same 404.
      const self = await call("PUT", `/me/following/${ctx.me.handle}`, { token: ctx.token });
      const nobody = await call("PUT", "/me/following/nadieexiste12345", { token: ctx.token });
      expectSameError(self, nobody, 404, "not_found", "propio e inexistente son el mismo 404");
      const malformed = await call("PUT", "/me/following/ab", { token: ctx.token });
      expectSameError(malformed, nobody, 404, "not_found", "malformado es el mismo 404 (sin oráculo de forma)");
      // `@eric` and `ERIC` normalize to the same handle: still one row.
      assert.equal((await call("PUT", "/me/following/%40ERIC", { token: ctx.token })).status, 204);
      // The follow shows up in the own list.
      const list = await call("GET", "/me/following", { token: ctx.token });
      const parsed = expectOk(list, 200, z.object({ items: z.array(z.object({ handle: z.string() })) }));
      assert.ok(parsed.items.some((p) => p.handle === "eric"), "@eric aparece en GET /me/following");
    },
  },
  {
    name: "E1 DELETE /me/following/eric → 204 (idempotente, sin gate isPublic)",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const before = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema).followingCount;
      const del = await call("DELETE", "/me/following/eric", { token: ctx.token });
      assert.equal(del.status, 204, `esperaba 204, llegó ${del.status}: ${del.text}`);
      expectNoStore(del);
      const after = expectOk(await call("GET", "/me", { token: ctx.token }), 200, MeSchema).followingCount;
      assert.equal(after, before - 1);
      const again = await call("DELETE", "/me/following/eric", { token: ctx.token });
      assert.equal(again.status, 204, "dejar de seguir dos veces no falla");
      const nobody = await call("DELETE", "/me/following/nadieexiste12345", { token: ctx.token });
      assert.equal(nobody.status, 204, "handle desconocido → 204, la respuesta nunca varía");
      expectError(await call("DELETE", "/me/following/ab", { token: ctx.token }), 404, "not_found");
    },
  },
  {
    name: "E1 menor de edad: POST /me/onboarding → 403 underage, siguiente llamada 401, fila borrada en DB",
    run: async () => {
      const email = `qa-api-${e1Epoch}-minor@baclog.dev`;
      const { token } = await e1SignInAs(email);
      try {
        const res = await call("POST", "/me/onboarding", {
          token,
          body: { name: "Peque", birthYear: new Date().getFullYear() - 10 },
        });
        const err = expectError(res, 403, "forbidden");
        assert.equal(err.reason, "underage");
        expectError(await call("GET", "/me", { token }), 401, "unauthorized");
        expectError(await call("DELETE", "/me", { token }), 401, "unauthorized");
      } finally {
        await e1DeleteUserRow(email);
      }
    },
  },
  // Phase 2 adds: collections CRUD, memberships, mark, review, follow, PATCH
  // /me — against a DISPOSABLE QA account (DELETE /me at the end).

  // E2 — colecciones CRUD · membresías · marca · biblioteca · picks (ios/API.md
  // §4 Colecciones + Títulos y estado propio). Runs on the QA account E1's
  // onboarding just named. Leaves the library the way E3 needs it: one title
  // WITH a reaction (an onboarding pick, obsessed) and one WITHOUT (a plain
  // save). A title with a future `releaseDate` is needed for the 409
  // `not_released` case: pass it as SMOKE_UPCOMING_TITLE_ID (from the DB:
  // `select id from catalog_item where release_date > now()`), else skipped.
  {
    name: "E2 POST /me/onboarding/picks → { collection } con 3 obsessed; re-entrada no duplica; 400/404",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const hits = await e2Search("blade runner");
      assert.ok(hits.length >= 5, `la búsqueda dio ${hits.length} resultados con id; hacen falta 5`);
      e2.picks = hits.slice(0, 3).map((h) => h.id!);
      e2.plain = hits[3].id!;
      e2.spare = hits[4];

      const bad = await e2call("POST", "/me/onboarding/picks", { body: { titles: [] } });
      expectError(bad, 400, "invalid");
      const unknown = await e2call("POST", "/me/onboarding/picks", {
        body: { titles: [{ id: "00000000-0000-0000-0000-000000000000" }] },
      });
      const nf = expectError(unknown, 404, "not_found");
      assert.ok(nf.message.includes("catálogo"), "el 404 explica que hay que buscar de nuevo");

      const before = await e2Collections();
      const res = await e2call("POST", "/me/onboarding/picks", {
        body: { titles: e2.picks.map((id) => ({ id })) },
      });
      const { collection } = expectOk(res, 200, z.object({ collection: CollectionSchema }));
      assert.equal(collection.name, "Obsesiones");
      assert.deepEqual([...collection.titleIds].sort(), [...e2.picks].sort(), "los 3 picks son miembros");
      e2.obsesiones = collection.id;
      const after = await e2Collections();
      assert.equal(after.length, before.length + 1, "una colección nueva");

      const detail = await e2Detail(collection.id);
      for (const id of e2.picks) assert.equal(detail.states[id].mark, "obsessed", `${id} obsessed`);

      // Re-entry: same collection, no second "Obsesiones", nothing restamped.
      const again = await e2call("POST", "/me/onboarding/picks", {
        body: { titles: [{ id: e2.picks[0] }] },
      });
      const twice = expectOk(again, 200, z.object({ collection: CollectionSchema }));
      assert.equal(twice.collection.id, collection.id, "re-entrada cae en la misma colección");
      assert.equal((await e2Collections()).length, after.length, "sin colección duplicada");
    },
  },
  {
    name: "E2 POST /collections (link) → 200 Collection; nombre vacío → 400",
    run: async () => {
      const bad = await e2call("POST", "/collections", { body: { name: "   ", visibility: "link" } });
      const err = expectError(bad, 400, "invalid");
      assert.ok(err.fields && "name" in err.fields, "fields.name presente");

      const res = await e2call("POST", "/collections", {
        body: { name: "Smoke E2", vibe: "temporal", visibility: "link" },
      });
      const c = expectOk(res, 200, CollectionSchema);
      assert.equal(c.name, "Smoke E2");
      assert.equal(c.vibe, "temporal");
      assert.equal(c.visibility, "link");
      assert.deepEqual(c.titleIds, []);
      assert.equal(c.coverTitleId, null);
      e2.collection = c.id;
      assert.ok((await e2Collections()).some((x) => x.id === c.id), "aparece en GET /collections");
    },
  },
  {
    name: "E2 PATCH /collections/{id} (rename + profile, vibe null) → Collection releída; ajeno → 404",
    run: async () => {
      const res = await e2call("PATCH", `/collections/${e2.collection}`, {
        body: { name: "Smoke E2 renombrada", vibe: null, visibility: "profile" },
      });
      const c = expectOk(res, 200, CollectionSchema);
      assert.equal(c.name, "Smoke E2 renombrada");
      assert.equal(c.vibe, null, "vibe null limpia");
      assert.equal(c.visibility, "profile");
      assert.ok(c.updatedAt >= c.createdAt);

      const noop = expectOk(await e2call("PATCH", `/collections/${e2.collection}`, { body: {} }), 200, CollectionSchema);
      assert.equal(noop.name, c.name, "body vacío = no-op que devuelve el recurso");

      const foreign = await e2call("PATCH", "/collections/00000000-0000-0000-0000-000000000000", {
        body: { name: "x" },
      });
      expectError(foreign, 404, "not_found");
      const tooLong = await e2call("PATCH", `/collections/${e2.collection}`, { body: { name: "x".repeat(61) } });
      expectError(tooLong, 400, "invalid");
    },
  },
  {
    name: "E2 PUT /collections/{id}/titles/{titleId} → { title, state } (idempotente ×2, externalRef de respaldo, 404)",
    run: async () => {
      const Body = z.object({ title: TitleSchema, state: TitleStateSchema });
      const first = expectOk(
        await e2call("PUT", `/collections/${e2.collection}/titles/${e2.plain}`, { body: {} }),
        200,
        Body,
      );
      assert.equal(first.title.id, e2.plain);
      assert.equal(first.state.titleId, e2.plain);
      assert.equal(first.state.mark, null, "un save simple no lleva marca");
      // No body at all — the app may send a bare PUT.
      const second = expectOk(
        await e2call("PUT", `/collections/${e2.collection}/titles/${e2.plain}`),
        200,
        Body,
      );
      assert.equal(second.state.savedAt, first.state.savedAt, "repetir no re-crea el user_item");

      const detail = await e2Detail(e2.collection);
      assert.deepEqual(detail.collection.titleIds, [e2.plain]);
      assert.equal(detail.collection.coverTitleId, first.title.coverUrl ? e2.plain : null);

      // externalRef fallback: a bogus id + the search result's ref resolves.
      const viaRef = expectOk(
        await e2call("PUT", `/collections/${e2.collection}/titles/not-a-real-id`, {
          body: { externalRef: e2.spare!.externalRef },
        }),
        200,
        Body,
      );
      assert.equal(viaRef.title.id, e2.spare!.id, "title.id es el id canónico del catálogo");

      const missing = await e2call("PUT", `/collections/${e2.collection}/titles/not-a-real-id`, {
        body: { externalRef: { source: "tmdb", externalId: "0" } },
      });
      const nf = expectError(missing, 404, "not_found");
      assert.ok(nf.message.includes("catálogo"));
      expectError(await e2call("PUT", `/collections/${e2.collection}/titles/not-a-real-id`), 404, "not_found");
      expectError(
        await e2call("PUT", `/collections/00000000-0000-0000-0000-000000000000/titles/${e2.plain}`),
        404,
        "not_found",
      );
      expectError(
        await e2call("PUT", `/collections/${e2.collection}/titles/${e2.plain}`, { body: { paletteHex: ["rojo"] } }),
        400,
        "invalid",
      );
    },
  },
  {
    name: "E2 PUT /me/titles/{id}/mark liked → obsessed → completed → null (TitleState releído); 404/400",
    run: async () => {
      const mark = async (m: string | null) =>
        expectOk(
          await e2call("PUT", `/me/titles/${e2.plain}/mark`, { body: { mark: m } }),
          200,
          TitleStateSchema,
        );
      assert.equal((await mark("liked")).mark, "liked");
      assert.equal((await mark("liked")).mark, "liked", "idempotente");
      assert.equal((await mark("obsessed")).mark, "obsessed");
      assert.equal((await mark("completed")).mark, "completed");
      assert.equal((await mark(null)).mark, null);
      const lib = await e2Library();
      assert.equal(lib.get(e2.plain)?.mark, null, "GET /me/titles coincide");

      expectError(
        await e2call("PUT", `/me/titles/${e2.plain}/mark`, { body: { mark: "loved" } }),
        400,
        "invalid",
      );
      expectError(
        await e2call("PUT", "/me/titles/00000000-0000-0000-0000-000000000000/mark", { body: { mark: "liked" } }),
        404,
        "not_found",
      );
      expectError(await e2call("PUT", `/me/titles/${e2.plain}/episodes/s1e1`, { body: {} }), 501, "unsupported");
      expectError(await e2call("DELETE", `/me/titles/${e2.plain}/episodes/s1e1`), 501, "unsupported");
    },
  },
  {
    name: "E2 marca sobre un estreno futuro → 409 not_released; con preview:true → 200",
    run: async () => {
      const upcoming = process.env.SMOKE_UPCOMING_TITLE_ID;
      if (!upcoming) skip("sin SMOKE_UPCOMING_TITLE_ID (un catalog_item con release_date > now())");
      expectOk(
        await e2call("PUT", `/collections/${e2.collection}/titles/${upcoming}`),
        200,
        z.object({ title: TitleSchema, state: TitleStateSchema }),
      );
      const refused = await e2call("PUT", `/me/titles/${upcoming}/mark`, { body: { mark: "liked" } });
      const err = expectError(refused, 409, "conflict");
      assert.equal(err.reason, "not_released");
      assert.ok(err.message.includes("preestreno"));
      const lib = await e2Library();
      assert.equal(lib.get(upcoming)?.mark, null, "el 409 no escribió nada");

      const allowed = await e2call("PUT", `/me/titles/${upcoming}/mark`, { body: { mark: "liked", preview: true } });
      assert.equal(expectOk(allowed, 200, TitleStateSchema).mark, "liked");
      // null never needs preview (nothing to gate).
      const cleared = await e2call("PUT", `/me/titles/${upcoming}/mark`, { body: { mark: null } });
      assert.equal(expectOk(cleared, 200, TitleStateSchema).mark, null);

      const gone = await e2call("DELETE", `/collections/${e2.collection}/titles/${upcoming}`);
      assert.equal(gone.status, 204);
      assert.ok(!(await e2Library()).has(upcoming), "última membresía → user_item GC");
    },
  },
  {
    name: "E2 DELETE /collections/{id}/titles/{titleId} → 204; última membresía GC del user_item; repetir → 204",
    run: async () => {
      // spare lives only in the smoke collection → GC.
      const spare = e2.spare!.id!;
      const res = await e2call("DELETE", `/collections/${e2.collection}/titles/${spare}`);
      assert.equal(res.status, 204, res.text);
      expectNoStore(res);
      assert.ok(!(await e2Library()).has(spare), "desapareció de GET /me/titles");
      assert.equal((await e2call("DELETE", `/collections/${e2.collection}/titles/${spare}`)).status, 204, "idempotente");

      // plain in TWO collections: dropping one keeps the state (savedAt intact).
      const lib0 = await e2Library();
      expectOk(
        await e2call("PUT", `/collections/${e2.obsesiones}/titles/${e2.plain}`),
        200,
        z.object({ title: TitleSchema, state: TitleStateSchema }),
      );
      assert.equal((await e2call("DELETE", `/collections/${e2.collection}/titles/${e2.plain}`)).status, 204);
      const lib1 = await e2Library();
      assert.equal(lib1.get(e2.plain)?.savedAt, lib0.get(e2.plain)?.savedAt, "sigue en la biblioteca, mismo savedAt");
      assert.deepEqual((await e2Detail(e2.collection)).collection.titleIds, []);
      expectError(
        await e2call("DELETE", `/collections/00000000-0000-0000-0000-000000000000/titles/${e2.plain}`),
        404,
        "not_found",
      );
    },
  },
  {
    name: "E2 DELETE /me/titles/{id} → 204 en todas las colecciones; repetir → 204",
    run: async () => {
      const victim = e2.picks[2];
      const res = await e2call("DELETE", `/me/titles/${victim}`);
      assert.equal(res.status, 204, res.text);
      expectNoStore(res);
      assert.ok(!(await e2Library()).has(victim), "fuera de GET /me/titles");
      assert.ok(!(await e2Detail(e2.obsesiones)).collection.titleIds.includes(victim), "fuera de Obsesiones");
      assert.equal((await e2call("DELETE", `/me/titles/${victim}`)).status, 204, "idempotente");
    },
  },
  {
    name: "E2 DELETE /collections/{id} → 204, luego GET → 404 (sin GC de user_item, como la web)",
    run: async () => {
      const res = await e2call("DELETE", `/collections/${e2.collection}`);
      assert.equal(res.status, 204, res.text);
      expectNoStore(res);
      expectError(await e2call("GET", `/collections/${e2.collection}`), 404, "not_found");
      expectError(await e2call("DELETE", `/collections/${e2.collection}`), 404, "not_found");
      assert.ok(!(await e2Collections()).some((c) => c.id === e2.collection));
      // What E3 needs: picks[0] obsessed (reacted) + plain saved (mark null).
      const lib = await e2Library();
      assert.equal(lib.get(e2.picks[0])?.mark, "obsessed");
      assert.equal(lib.get(e2.plain)?.mark, null);
    },
  },
  // E3 — PUT|DELETE /me/titles/{id}/review (ios/API.md §4). Needs, in the QA
  // account's library, one title WITH a reaction (mark != null) and one
  // WITHOUT (a plain save) — seeded by SQL or by the E2 cases above.
  {
    name: "E3 · review: sin reacción → 409 conflict reaction_required",
    run: async () => {
      const { plain } = await e3Titles();
      const res = await e3call("PUT", `/me/titles/${plain}/review`, {
        body: { body: "Sin marcar todavía.", hasSpoiler: false },
      });
      const err = expectError(res, 409, "conflict");
      assert.equal(err.reason, "reaction_required");
      assert.ok(err.message.length > 0, "el 409 lleva texto final en español");
    },
  },
  {
    name: "E3 · review: con enlace → 400 invalid fields.body",
    run: async () => {
      const { reacted } = await e3Titles();
      const res = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "Miren esto en https://ejemplo.com ya", hasSpoiler: false },
      });
      const err = expectError(res, 400, "invalid");
      assert.ok(err.fields?.body, "fields.body explica que no van enlaces");
    },
  },
  {
    name: "E3 · review: vacía / >280 → 400 invalid fields.body",
    run: async () => {
      const { reacted } = await e3Titles();
      const empty = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "   ", hasSpoiler: false },
      });
      assert.ok(expectError(empty, 400, "invalid").fields?.body);
      const long = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "x".repeat(281), hasSpoiler: false },
      });
      assert.ok(expectError(long, 400, "invalid").fields?.body);
      const notBool = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "ok", hasSpoiler: "sí" },
      });
      expectError(notBool, 400, "invalid");
    },
  },
  {
    name: "E3 · review: PUT ok → Review con mark del autor; PUT de nuevo edita (mismo id)",
    run: async () => {
      const { reacted, reactedMark } = await e3Titles();
      const first = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "  Primera versión, smoke E3.  ", hasSpoiler: true },
      });
      const me = await e3Me();
      const a = expectOk(first, 200, ReviewSchema);
      assert.equal(a.titleId, reacted);
      assert.equal(a.body, "Primera versión, smoke E3.", "el body llega trimmed");
      // TitleState.mark folds `disliked` into `completed`; Review.mark keeps it.
      assert.ok(a.mark !== null, "mark = la reacción del autor (publicMarkOf)");
      if (reactedMark !== "completed") assert.equal(a.mark, reactedMark);
      assert.equal(a.authorHandle, me.handle ?? null, "authorHandle = handle propio, o null sin handle (nunca un id)");
      assert.equal(a.hidden, false);
      assert.ok(!first.text.includes("\"userId\""), "ningún userId viaja");
      e3.review = a;

      const second = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "Segunda versión, editada.", hasSpoiler: false },
      });
      const b = expectOk(second, 200, ReviewSchema);
      assert.equal(b.id, a.id, "editar conserva el id (upsert)");
      assert.equal(b.body, "Segunda versión, editada.");
      assert.equal(b.hasSpoiler, false);
      assert.equal(b.createdAt, a.createdAt, "createdAt no cambia al editar");
      assert.ok(b.updatedAt >= a.updatedAt, "updatedAt avanza (o igual al segundo)");
    },
  },
  {
    name: "E3 · review: título fuera de la biblioteca → 404 not_found",
    run: async () => {
      const ghost = "00000000-0000-4000-8000-00000000e3e3";
      const put = await e3call("PUT", `/me/titles/${ghost}/review`, {
        body: { body: "no existe", hasSpoiler: false },
      });
      expectError(put, 404, "not_found");
      const del = await e3call("DELETE", `/me/titles/${ghost}/review`);
      expectError(del, 404, "not_found");
    },
  },
  {
    name: "E3 · review: DELETE → 204, y de nuevo → 204 (idempotente)",
    run: async () => {
      const { reacted } = await e3Titles();
      const first = await e3call("DELETE", `/me/titles/${reacted}/review`);
      assert.equal(first.status, 204, `esperaba 204, llegó ${first.status}: ${first.text}`);
      expectNoStore(first);
      const again = await e3call("DELETE", `/me/titles/${reacted}/review`);
      assert.equal(again.status, 204, `segundo DELETE: esperaba 204, llegó ${again.status}`);
      // A fresh PUT after the delete gets a NEW id (the row is really gone).
      const back = await e3call("PUT", `/me/titles/${reacted}/review`, {
        body: { body: "Tercera, tras borrar.", hasSpoiler: false },
      });
      const c = expectOk(back, 200, ReviewSchema);
      assert.notEqual(c.id, e3.review?.id, "tras DELETE, un PUT crea otra fila");
      const clean = await e3call("DELETE", `/me/titles/${reacted}/review`);
      assert.equal(clean.status, 204);
    },
  },
];

/**
 * E1 — the LAST write case, always: it deletes the QA account every other
 * write case runs as. Pushed after the literal (not written inside it) so
 * cases other lanes append to `writes` still run with a live token.
 */
const e1DeleteMe: Case = {
    name: "E1 DELETE /me → 204, después GET /me → 401 y ninguna fila qa-api- en la DB",
    run: async () => {
      assert.ok(ctx.token, "hace falta un token");
      const del = await e3call("DELETE", "/me");
      assert.equal(del.status, 204, `esperaba 204, llegó ${del.status}: ${del.text}`);
      expectNoStore(del);
      expectError(await e3call("GET", "/me"), 401, "unauthorized");
      assert.equal(await e1CountQaRows(), 0, "no queda ninguna cuenta qa-api- en la DB");
      ctx.token = null;
      ctx.me = null;
    },
  };

writes.push(e1DeleteMe);

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
  let skipped = 0;
  for (const section of opts.only) {
    const all = sections[section];
    if (!all) {
      console.error(`Sección desconocida: ${section}`);
      process.exit(2);
    }
    const cases = opts.grep ? all.filter((c) => c.name.toLowerCase().includes(opts.grep)) : all;
    console.log(`\n[${section}]${cases.length === 0 ? " (sin casos)" : ""}`);
    for (const c of cases) {
      const t0 = Date.now();
      try {
        await c.run();
        console.log(`   ok   ${c.name} (${Date.now() - t0} ms)`);
        ran++;
      } catch (err) {
        if (err instanceof SkipCase) {
          console.log(`   SKIP ${c.name} — ${err.message}`);
          skipped++;
          continue;
        }
        console.error(`   FAIL ${c.name}`);
        console.error(err instanceof Error ? err.message : err);
        // A FAIL in `writes` aborts before `e1DeleteMe` — the QA account would
        // stay alive in the DB (= prod). Best-effort cleanup, then exit 1.
        if (section === "writes" && c !== e1DeleteMe && ctx.token) {
          try {
            await e1DeleteMe.run();
            console.error("   (limpieza: cuenta QA borrada con E1 DELETE /me)");
          } catch (cleanupErr) {
            console.error(
              `   (limpieza FALLÓ — borra a mano: select email from "user" where email like 'qa-api-%') ${
                cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
              }`,
            );
          }
        }
        process.exit(1);
      }
    }
  }
  console.log(`\n${ran} ok · ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
