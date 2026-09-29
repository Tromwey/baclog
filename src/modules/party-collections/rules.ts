import { z } from "zod";
import { SITE_URL } from "@/lib/site";
import type { PartyRole } from "./types";

/**
 * Colecciones de fiesta — the business rules as PURE functions (no DB, no
 * `server-only`, no `node:crypto`): the module's writes and reads call these,
 * the web and the API speak their outcomes, and `scripts/check-party-rules.ts`
 * exercises them without a database. CLIENT-SAFE on purpose — client
 * components import `invitePath`/`partyPath`/`DEFAULT_PER_GUEST_LIMIT` from
 * here. What needs a secret or randomness (`newInviteToken`, `guestRefOf`)
 * lives in `tokens.ts` (server only).
 */

// ---------- limits ----------

/** "Canciones por invitado": 0 = solo ver · 1..5 · null = ilimitadas. */
export const PER_GUEST_LIMIT_MAX = 5;
export const DEFAULT_PER_GUEST_LIMIT = 3;
export const perGuestLimitSchema = z.union([
  z.number().int().min(0).max(PER_GUEST_LIMIT_MAX),
  z.null(),
]);

/** Same grammar as a collection name (`backlogNameSchema`). */
export const partyNameSchema = z.string().trim().min(1).max(60);

/** Song search query (iTunes `term`). */
export const songQuerySchema = z.string().trim().min(1).max(100);

// ---------- invite link ----------

/** 12 random bytes → 16 chars of base64url (96 bits): the link IS the secret
 *  (minted by `newInviteToken`, tokens.ts). */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;

/** The token if it has the shape we mint, else null — a malformed token is
 *  the same "este link ya no funciona" as a revoked or unknown one. */
export function parseInviteToken(raw: unknown): string | null {
  return typeof raw === "string" && INVITE_TOKEN_RE.test(raw) ? raw : null;
}

/** Public invite URL: `https://get-kura.app/f/{token}`. */
export function inviteUrl(token: string): string {
  return `${SITE_URL}/f/${token}`;
}

/** Invite landing path (anonymous-capable). */
export function invitePath(token: string): string {
  return `/f/${token}`;
}

/** Member page path (host + guests, session required). */
export function partyPath(backlogId: string): string {
  return `/c/${backlogId}`;
}

// ---------- who may do what ----------

export interface ViewerFacts {
  role: PartyRole;
  /** The host blocked this guest IN THIS PARTY ("Quitar y bloquear"). A user
   *  block (`user_block`, either way) with the host is not "blocked": it
   *  takes the party away entirely (`getPartyAccess` = null, contract C2). */
  blocked: boolean;
  /** `party.per_guest_limit`. */
  perGuestLimit: number | null;
  /** Songs this viewer already put in this party. */
  mineCount: number;
}

/** Songs still allowed; null = no cap (host, or an unlimited party). */
export function remainingFor(v: ViewerFacts): number | null {
  if (v.role === "host") return null;
  if (v.blocked) return 0;
  if (v.perGuestLimit === null) return null;
  return Math.max(0, v.perGuestLimit - v.mineCount);
}

export function canAddNow(v: ViewerFacts): boolean {
  const r = remainingFor(v);
  return !(v.role === "guest" && v.blocked) && (r === null || r > 0);
}

export type AddRefusal =
  /** Guest blocked by the host (or a user block with the host). */
  | "blocked"
  /** Party is "solo ver" (per_guest_limit = 0) for guests. */
  | "view_only"
  /** The song is already in the party — put by the viewer. */
  | "duplicate_mine"
  /** The song is already in the party — put by someone else. */
  | "duplicate_other"
  /** Guest reached their cap ("ya pusiste tus 3"). */
  | "cap_reached";

/**
 * Can this viewer add THIS song now? The order is the design's: a blocked
 * guest can't do anything; a duplicate is reported before the cap (the
 * design says "Ya está, la puso @ana" even when your 3 are used up); then the
 * cap. The host has no cap and is never blocked.
 */
export function decideAdd(
  v: ViewerFacts,
  existing: { mine: boolean } | null,
): { ok: true } | { ok: false; reason: AddRefusal } {
  if (v.role === "guest" && v.blocked) return { ok: false, reason: "blocked" };
  if (v.role === "guest" && v.perGuestLimit === 0) return { ok: false, reason: "view_only" };
  if (existing) return { ok: false, reason: existing.mine ? "duplicate_mine" : "duplicate_other" };
  const r = remainingFor(v);
  if (r !== null && r <= 0) return { ok: false, reason: "cap_reached" };
  return { ok: true };
}

/** Host → any song. Guest → only their own — ALSO while blocked (contract
 *  C4: a blocked guest can't add, but may still take their own songs out). */
export function canRemoveSong(v: Pick<ViewerFacts, "role" | "blocked">, mine: boolean): boolean {
  if (v.role === "host") return true;
  return mine;
}

/** "Quitar y bloquear a @x": host only, author must be a guest that still
 *  exists (not the host, not a deleted account). */
export function canBlockAuthor(
  role: PartyRole,
  author: { exists: boolean; isHost: boolean },
): boolean {
  return role === "host" && author.exists && !author.isHost;
}

/**
 * An add whose INSERT wrote nothing (a race: someone put the song, the host
 * blocked us, our cap filled from another device). Re-decided from FRESH
 * state; when fresh state says "you may" the loss is unexplained and the
 * answer is `conflict` (contract C5) — never `cap_reached`, which is a lie
 * for the host (no cap) and for an unlimited party.
 */
export function lostAddOutcome(
  v: ViewerFacts,
  existing: { mine: boolean } | null,
): AddRefusal | "conflict" {
  const d = decideAdd(v, existing);
  return d.ok ? "conflict" : d.reason;
}

// ---------- membership: leave / re-enter (contract C3) ----------

/** The membership row as leave/join see it (`backlog_collaborator`). */
export interface MemberRow {
  /** `blocked_at IS NOT NULL` — the host's per-party block. */
  blocked: boolean;
  /** `left_at IS NOT NULL` — a blocked guest who left (row kept). */
  left: boolean;
}

/** Only a guest leaves (the host deletes the party instead). */
export function canLeave(role: PartyRole | null): boolean {
  return role === "guest";
}

/**
 * "Salir de la fiesta": an unblocked guest's row is DELETED (they may come
 * back with an active link, like anyone new); a blocked guest's row is KEPT
 * with `left_at` — deleting it would launder the block (leave, re-enter,
 * add again).
 */
export function leaveEffect(row: MemberRow): "delete" | "mark_left" {
  return row.blocked ? "mark_left" : "delete";
}

export type JoinOutcome =
  | { ok: true; joined: "new" | "already"; blocked: boolean }
  | { ok: false; error: "invalid_link" };

/**
 * Entering through the link, for a non-host account (the SQL in
 * `joinParty` is this, in one statement): a user block with the host →
 * `invalid_link` (even for a member, C2); an active row → already inside
 * (no link needed to stay); otherwise the link must be active — no row → a
 * new member; a row that LEFT → back in, `blocked` exactly as it was
 * (re-entering never clears a block).
 */
export function joinOutcome(
  row: MemberRow | null,
  ctx: { linkActive: boolean; userBlocked: boolean },
): JoinOutcome {
  // A user block with the host hides the party even from a member (C2).
  if (ctx.userBlocked) return { ok: false, error: "invalid_link" };
  if (row && !row.left) return { ok: true, joined: "already", blocked: row.blocked };
  if (!ctx.linkActive) return { ok: false, error: "invalid_link" };
  return { ok: true, joined: "new", blocked: row?.blocked ?? false };
}

// ---------- abuse limits (contract C7) ----------

/** Parties one account may HOST at once (existing ones: a deleted party
 *  frees its slot). */
export const MAX_HOSTED_PARTIES = 20;
export const TOO_MANY_PARTIES_MESSAGE = "Ya tienes 20 fiestas. Borra alguna para crear otra.";

/** Invite links minted per party per rolling hour — the first one (at
 *  creation) included. DB-backed: counts the party's `party_invite` rows
 *  created in the window, so it holds across instances. */
export const INVITE_ROTATIONS_PER_HOUR = 10;
const HOUR_S = 60 * 60;

/**
 * Null = may mint a new link now; else seconds until enough of the window's
 * links age out. `agesSeconds` = how old each of the party's invite rows
 * from the last hour is (computed in SQL: `now() - created_at`, so app and
 * DB clocks never mix).
 */
export function rotationRetryAfter(agesSeconds: number[]): number | null {
  const live = agesSeconds.filter((a) => a >= 0 && a < HOUR_S).sort((a, b) => b - a);
  if (live.length < INVITE_ROTATIONS_PER_HOUR) return null;
  const mustExpire = live[live.length - INVITE_ROTATIONS_PER_HOUR];
  return Math.max(1, Math.ceil(HOUR_S - mustExpire));
}

// ---------- opaque guest reference ----------

/** Shape of `guestRefOf` (tokens.ts): 22 chars of base64url. */
export const GUEST_REF_RE = /^[A-Za-z0-9_-]{22}$/;

// ---------- copy helpers (shared by /party and the member page) ----------

function songs(n: number): string {
  return `${n} ${n === 1 ? "canción" : "canciones"}`;
}

/**
 * /party: "8 canciones · @ana, @rodri y 2 más ya están dentro".
 * Variants: nobody inside → "8 canciones"; one named, no others → "… · @ana
 * ya está dentro"; nobody named → "… · 3 personas ya están dentro".
 */
export function presenceLine(s: { songCount: number; named: string[]; othersCount: number }): string {
  const head = songs(s.songCount);
  const named = s.named.map((h) => `@${h}`);
  const total = named.length + s.othersCount;
  if (total === 0) return head;
  const verb = total === 1 ? "ya está dentro" : "ya están dentro";
  if (named.length === 0) {
    return `${head} · ${s.othersCount} ${s.othersCount === 1 ? "persona" : "personas"} ${verb}`;
  }
  let who: string;
  if (s.othersCount === 0) {
    who = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} y ${named[named.length - 1]}`;
  } else {
    who = `${named.join(", ")} y ${s.othersCount} más`;
  }
  return `${head} · ${who} ${verb}`;
}

/** Duplicate toast: "Ya la pusiste tú." / "Ya está, la puso @ana" / "… alguien". */
export function duplicateMessage(mine: boolean, byHandle: string | null): string {
  if (mine) return "Ya la pusiste tú.";
  return `Ya está, la puso ${byHandle ? `@${byHandle}` : "alguien"}`;
}

/**
 * /party's card body with the party's REAL cap (C6 — it used to say "Pon tus
 * canciones" whatever the cap): "Pon tus 3 canciones. Van a sonar…" · one →
 * "Pon tu canción. Va a sonar…" · ilimitadas → "Pon tus canciones. …" ·
 * solo ver (0) → nothing to put, only to look.
 */
export function playlistPitch(perGuestLimit: number | null): string {
  const tail = "y todos verán quién puso cuál.";
  if (perGuestLimit === 0) return `Mira lo que va a sonar esa noche ${tail}`;
  if (perGuestLimit === 1) return `Pon tu canción. Va a sonar esa noche, ${tail}`;
  if (perGuestLimit === null) return `Pon tus canciones. Van a sonar esa noche, ${tail}`;
  return `Pon tus ${perGuestLimit} canciones. Van a sonar esa noche, ${tail}`;
}
