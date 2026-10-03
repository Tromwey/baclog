"use client";

import dynamic from "next/dynamic";

/** Client-only: the landing picks 3D vs. fallback and teaser vs. revealed from the device and Date.now() (no SSR to hydrate). */
const PartyLanding = dynamic(() => import("./party-landing"), { ssr: false });

export function PartyClient() {
  return <PartyLanding />;
}
