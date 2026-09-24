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
 */

const QUERIES_KEY = "kura.descubrir.recientes";
const SEEN_KEY = "kura.descubrir.vistos";
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

export function readRecentQueries(): string[] {
  return read(QUERIES_KEY, isString);
}

export function readSeen(): SeenWork[] {
  return read(SEEN_KEY, isSeen);
}

/** Newest first, case-insensitively deduped. Returns the new list. */
export function pushRecentQuery(q: string): string[] {
  const clean = q.trim();
  if (clean.length < 2) return readRecentQueries();
  const next = [
    clean,
    ...readRecentQueries().filter((x) => x.toLowerCase() !== clean.toLowerCase()),
  ].slice(0, MAX_QUERIES);
  write(QUERIES_KEY, next);
  return next;
}

export function removeRecentQuery(q: string): string[] {
  const next = readRecentQueries().filter((x) => x !== q);
  write(QUERIES_KEY, next);
  return next;
}

export function clearRecentQueries(): void {
  write(QUERIES_KEY, []);
}

export function pushSeen(w: SeenWork): void {
  write(
    SEEN_KEY,
    [w, ...readSeen().filter((x) => x.catalogItemId !== w.catalogItemId)].slice(0, MAX_SEEN),
  );
}
