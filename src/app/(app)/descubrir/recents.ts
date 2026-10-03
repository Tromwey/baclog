import type { MediaType } from "@/modules/catalog/types";

/**
 * 19d — "búsquedas recientes" and "vistos hace poco". Per-device convenience,
 * nothing else: they live in this browser's localStorage, never reach the
 * server and are never read by anyone but the person holding the phone. Every
 * access is wrapped — a private window or blocked storage simply shows
 * nothing, it never breaks the search.
 *
 * "Vistos" = titles opened FROM Descubrir (a result, the recommendation, a
 * trend, a release). The product has no per-title visit log, and this list
 * doesn't pretend to be one.
 *
 * PER ACCOUNT. The keys carry the owner's id (`…recientes:{userId}`): a shared
 * browser used to show the next person who signed in what the last one
 * searched and opened. Every function takes the `owner`; signing out and
 * deleting the account call `clearRecents()` from the client (the server
 * can't reach localStorage), which wipes every account's lists on this device
 * plus the un-scoped keys older builds wrote.
 */

const PREFIX = "kura.descubrir.";
const QUERIES_KEY = `${PREFIX}recientes`;
const SEEN_KEY = `${PREFIX}vistos`;
const keyFor = (base: string, owner: string) => `${base}:${owner}`;
const MAX_QUERIES = 8;
const MAX_SEEN = 10;

export interface SeenWork {
  catalogItemId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
}

function read<T>(key: string, valid: (x: unknown) => x is T): T[] {
  try {
    // The un-scoped lists of older builds belong to nobody in particular:
    // never read, and removed the first time anyone looks.
    window.localStorage.removeItem(QUERIES_KEY);
    window.localStorage.removeItem(SEEN_KEY);
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — recents are a convenience, drop it.
  }
}

const isString = (x: unknown): x is string => typeof x === "string";
const isSeen = (x: unknown): x is SeenWork =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as SeenWork).catalogItemId === "string" &&
  typeof (x as SeenWork).title === "string";

export function readRecentQueries(owner: string): string[] {
  if (!owner) return [];
  return read(keyFor(QUERIES_KEY, owner), isString);
}

export function readSeen(owner: string): SeenWork[] {
  if (!owner) return [];
  return read(keyFor(SEEN_KEY, owner), isSeen);
}

/**
 * Sign-out / delete-account, from the client: every Descubrir list on this
 * device goes, whoever it belonged to. Safe to call anywhere (no-op without
 * storage).
 */
export function clearRecents(): void {
  try {
    const ls = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) ls.removeItem(k);
  } catch {
    // no storage, nothing to clear
  }
}

/** Newest first, case-insensitively deduped. Returns the new list. */
export function pushRecentQuery(owner: string, q: string): string[] {
  const clean = q.trim();
  if (!owner || clean.length < 2) return readRecentQueries(owner);
  const next = [
    clean,
    ...readRecentQueries(owner).filter((x) => x.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, MAX_QUERIES);
  write(keyFor(QUERIES_KEY, owner), next);
  return next;
}

export function removeRecentQuery(owner: string, q: string): string[] {
  if (!owner) return [];
  const next = readRecentQueries(owner).filter((x) => x !== q);
  write(keyFor(QUERIES_KEY, owner), next);
  return next;
}

export function clearRecentQueries(owner: string): void {
  if (!owner) return;
  write(keyFor(QUERIES_KEY, owner), []);
}

export function pushSeen(owner: string, w: SeenWork): void {
  if (!owner) return;
  write(
    keyFor(SEEN_KEY, owner),
    [w, ...readSeen(owner).filter((x) => x.catalogItemId !== w.catalogItemId)].slice(0, MAX_SEEN),
  );
}
