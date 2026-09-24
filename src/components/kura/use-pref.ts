"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A per-viewer, per-device preference (the collection's "ver como lista",
 * its order): localStorage, read through useSyncExternalStore so the server
 * render and the first client render agree on `fallback` and the stored
 * value swaps in right after hydration — no mismatch, no setState in an
 * effect. Every access is guarded: private mode / blocked storage simply
 * means the fallback, every time.
 *
 * NOT for anything that must persist reliably or reach other devices — that
 * belongs in the database.
 */
const listeners = new Set<() => void>();
/** This tab's choices win (and keep working when storage is blocked). */
const memory = new Map<string, string>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  const mem = memory.get(key);
  if (mem !== undefined) return mem;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePref<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      memory.set(key, v);
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* storage blocked — the choice just doesn't stick */
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
