import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { SITE_URL } from "@/lib/site";
import type { PartyRole } from "./types";

/**
 * Colecciones de fiesta — the business rules as PURE functions (no DB, no
 * `server-only`): the module's writes and reads call these, the web and the
 * API speak their outcomes, and `scripts/check-party-rules.ts` exercises them
 * without a database.
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

/** 12 random bytes → 16 chars of base64url (96 bits): the link IS the secret. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;

export function newInviteToken(): string {
  return randomBytes(12).toString("base64url");
}

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
  /** Host blocked this guest, or a user block exists with the host. */
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

/** Host → any song. Guest → only their own, and not while blocked. */
export function canRemoveSong(v: Pick<ViewerFacts, "role" | "blocked">, mine: boolean): boolean {
  if (v.role === "host") return true;
  return mine && !v.blocked;
}

/** "Quitar y bloquear a @x": host only, author must be a guest that still
 *  exists (not the host, not a deleted account). */
export function canBlockAuthor(
  role: PartyRole,
  author: { exists: boolean; isHost: boolean },
): boolean {
  return role === "host" && author.exists && !author.isHost;
}

// ---------- opaque guest reference ----------

/** Per-party opaque reference to a guest (for "Desbloquear"): never the user
 *  id, and not correlatable across parties. */
export function guestRefOf(backlogId: string, userId: string): string {
  return createHash("sha256").update(`party-guest:${backlogId}:${userId}`).digest("base64url").slice(0, 22);
}

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
