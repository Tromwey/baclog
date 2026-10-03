/**
 * Sliding 60 s window, in-memory, PER INSTANCE. On Vercel each function
 * instance keeps its own Map, so the effective ceiling is limit × warm
 * instances and a cold start resets it — good enough to blunt a runaway
 * client or a script, NOT a global quota and NOT a security boundary (the
 * OTP flow has its own DB-backed cooldown + caps in src/auth/otp.ts).
 * Replace with a shared store (Upstash / Postgres) if it ever needs to be
 * global. Keys: `u:<sub>` for bearer routes, `ip:<addr>` for auth/*, and a
 * named bucket for everything else (`otp-req-ip:`, `report:u:`, …) so no two
 * surfaces share a quota by accident.
 *
 * Pure on purpose (no `server-only`, no DB, no imports; it reads `process.env.VERCEL` only): the Auth.js config,
 * route handlers, server actions and modules all use it, and
 * `src/authz/api.ts` re-exports it for the v1 handlers.
 */
const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < RATE_WINDOW_MS) return;
  lastSweep = now;
  for (const [key, stamps] of hits) {
    const live = stamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

/** Records one hit; returns how long to wait when over the limit. */
export function checkRateLimit(
  key: string,
  limit: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  sweep(now);
  const live = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (live.length >= limit) {
    const oldest = live[0];
    hits.set(key, live);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000)),
    };
  }
  live.push(now);
  hits.set(key, live);
  return { ok: true };
}

/**
 * The client address, from a header the CLIENT cannot choose. For budget keys
 * only (rate limits, the OTP origin) — never for identity.
 *
 * It used to be the FIRST hop of `x-forwarded-for`: behind a proxy that
 * appends, that hop is whatever the caller typed, so every per-IP limit was
 * one forged header away from a fresh bucket.
 *
 *   - On Vercel (`VERCEL` is set in every deployment): `x-real-ip`, then the
 *     LAST hop of `x-forwarded-for`. Vercel OVERWRITES both with the address
 *     of the connection it accepted and forwards nothing the client sent
 *     (vercel.com/docs/headers/request-headers). The last hop is the one the
 *     nearest proxy wrote under append semantics too, so the choice stays
 *     safe if that ever changes. get-kura.app / baclog.app are DNS-only on
 *     Cloudflare (`A 76.76.21.21`, grey cloud — state/infra.md): Vercel sees
 *     the real client. If they are ever PROXIED (orange), this returns a
 *     Cloudflare edge address — shared buckets, never a forgeable one — and
 *     the source must become `cf-connecting-ip` gated on Cloudflare's ranges.
 *   - Anywhere else (local dev, a self-hosted run) no proxy is trusted:
 *     "unknown" — ONE shared bucket. Fail-closed: no header is believed.
 *
 * WHAT COMES BACK IS THE NETWORK, not the raw address (`networkAddress`): an
 * IPv4 as is, an IPv6 as its /64 (`a:b:c:d::`), anything unparseable as
 * "unknown". One IPv6 subscriber owns 2^64 addresses (and rotates them for
 * free), so a limiter keyed by the full address was no limit at all. Doing it
 * HERE makes it true for every per-IP bucket at once (`ip:`, `otp-req-ip`,
 * `otp-verify-ip`, `invite-ip`, `report-ip`, `link-resolve-ip`, `handoff-ip`,
 * `tidal-callback-ip`, `waitlist-ip`) and keeps them on the SAME network the
 * OTP origin uses (`otpOrigin` → `networkOf`, which maps the value returned
 * here onto itself).
 *
 * Takes the header bag so a server action (`await headers()`) can use it too.
 */
export function clientIpOf(
  headers: { get(name: string): string | null },
  onVercel: boolean = Boolean(process.env.VERCEL),
): string {
  if (!onVercel) return "unknown";
  const real = headers.get("x-real-ip")?.trim();
  if (real) return networkAddress(real);
  const hops = (headers.get("x-forwarded-for") ?? "").split(",");
  return networkAddress(hops[hops.length - 1]);
}

export function clientIp(request: Request): string {
  return clientIpOf(request.headers);
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Of(raw: string): string | null {
  const m = IPV4_RE.exec(raw);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts.join(".") : null;
}

/**
 * The network a client address belongs to — THE unit every per-IP budget is
 * keyed by: "v4:<addr>" · "v6:<first four hextets>" (the /64) · "unknown".
 * An IPv4-mapped IPv6 is its IPv4. Anything else — empty, garbage — is
 * "unknown": fail-closed, one shared budget.
 */
export function networkOf(ip: string | null | undefined): string {
  const raw = (ip ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const v4 = ipv4Of(raw);
  if (v4) return `v4:${v4}`;
  if (!/^[0-9a-f:.]+$/.test(raw) || !raw.includes(":")) return "unknown";
  // An embedded IPv4 tail (`::ffff:1.2.3.4`) only counts when it is the
  // IPv4-mapped form; then the origin is that IPv4.
  const lastColon = raw.lastIndexOf(":");
  const tail = raw.slice(lastColon + 1);
  if (tail.includes(".")) {
    const mapped = ipv4Of(tail);
    return mapped && /^(0*:)*:?ffff$/.test(raw.slice(0, lastColon)) ? `v4:${mapped}` : "unknown";
  }
  const halves = raw.split("::");
  if (halves.length > 2) return "unknown";
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return "unknown";
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return "unknown";
  return `v6:${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}`;
}

/**
 * `networkOf` as an ADDRESS again, so the result is still something
 * `networkOf` / `otpOrigin` accept and map to the same network: the IPv4, the
 * /64 written `a:b:c:d::`, or "unknown".
 */
export function networkAddress(ip: string | null | undefined): string {
  const net = networkOf(ip);
  if (net.startsWith("v4:")) return net.slice(3);
  if (net.startsWith("v6:")) return `${net.slice(3)}::`;
  return "unknown";
}
