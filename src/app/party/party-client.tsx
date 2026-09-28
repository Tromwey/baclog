"use client";

import dynamic from "next/dynamic";

/** Client-only: the scene reads window size and Date.now() on every render (no SSR to hydrate). */
const PartyInvitation = dynamic(() => import("./party-invitation"), { ssr: false });

export function PartyClient() {
  return <PartyInvitation />;
}
