"use client";

import { useSyncExternalStore } from "react";
import { PARTY_EVENT } from "@/modules/party/event";

/**
 * The invitation's one-second clock, kept OUT of `PartyInvitation`'s state.
 *
 * It used to be `setState({ now })` every second on the class: each tick
 * re-ran `renderVals()` and re-rendered the whole cemetery (hundreds of
 * inline-styled nodes) to change three numbers and one word. Now the tick
 * lives in a tiny external store and only the leaves that read it —
 * `CountdownValue` and `DeathText` — re-render.
 *
 * One interval for every subscriber, started with the first and cleared with
 * the last. The snapshot is whole seconds, so it is stable between ticks.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onTick: () => void) {
  listeners.add(onTick);
  if (timer === null) timer = setInterval(() => listeners.forEach((l) => l()), 1000);
  return () => {
    listeners.delete(onTick);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const seconds = () => Math.floor(Date.now() / 1000);

function useSeconds(): number {
  // The scene is client-only (party-client.tsx); 0 is never painted.
  return useSyncExternalStore(subscribe, seconds, () => 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** One cell of the countdown to the party: days, hours or minutes left. */
export function CountdownValue({ part }: { part: "days" | "hours" | "minutes" }) {
  const now = useSeconds() * 1000;
  let diff = Math.max(0, new Date(PARTY_EVENT.dateISO).getTime() - now);
  const days = Math.floor(diff / 864e5);
  diff -= days * 864e5;
  const hours = Math.floor(diff / 36e5);
  diff -= hours * 36e5;
  const minutes = Math.floor(diff / 6e4);
  return <>{pad(part === "days" ? days : part === "hours" ? hours : minutes)}</>;
}

/** The epitaph's date of death, flickering between two readings each second. */
export function DeathText() {
  return <>{useSeconds() % 2 ? "ERROR" : "▒▒ de ▒▒▒▒ de 20▒▒"}</>;
}
