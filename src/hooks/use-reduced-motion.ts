"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** `prefers-reduced-motion: reduce`, live. The server (and the first client
 *  render) assume full motion. Imperative code that runs once can just read
 *  `prefersReducedMotion()`. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}
