import type { Metadata, Viewport } from "next";
import { Cinzel, Creepster, Oswald, Pirata_One, Space_Mono } from "next/font/google";
import { PARTY_LANDING } from "@/modules/party/event";
import { PartyClient } from "./party-client";
import "./party-landing.css";

/*
 * /party — the 3D landing (see party-landing.tsx), hosted inside Kura but
 * outside its design system on purpose: it's its own world (the design's
 * fonts and palette). Public, no session.
 */

const creep = Creepster({ subsets: ["latin"], weight: "400", variable: "--pl-creep", display: "swap" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600"], variable: "--pl-oswald", display: "swap" });
// The design's two alternate type sets (`?tipo=lapida|gotico`): not preloaded.
const cinzel = Cinzel({ subsets: ["latin"], weight: "700", variable: "--pl-cinzel", display: "swap", preload: false });
const pirata = Pirata_One({ subsets: ["latin"], weight: "400", variable: "--pl-pirata", display: "swap", preload: false });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: "700", variable: "--pl-spacemono", display: "swap", preload: false });

/** Teaser until the gate opens; rendered per request so the title flips on its own. */
export const dynamic = "force-dynamic";

/**
 * The link preview gives nothing away (founder, 2026-10-01): a pair of eyes in
 * the dark, in both states — never a capture of the scene. The alt stays as
 * vague as the image.
 */
const PREVIEW = { url: "/party/og-dark.jpg", width: 1200, height: 630, alt: "Algo te mira desde la oscuridad." };

export function generateMetadata(): Metadata {
  const open = Date.now() >= new Date(PARTY_LANDING.opensISO).getTime();
  const title = open ? "Entra si te atreves" : "Muy pronto";
  const description = open ? "Si te atreves." : "Muy pronto.";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: "/party", images: [PREVIEW] },
    twitter: { card: "summary_large_image", title, description, images: [PREVIEW.url] },
  };
}

/** Safari's bars take the scene's night instead of Kura's. */
export const viewport: Viewport = { themeColor: "#08090c" };

export default function PartyPage() {
  return (
    <div className={`${creep.variable} ${oswald.variable} ${cinzel.variable} ${pirata.variable} ${spaceMono.variable}`}>
      <PartyClient />
    </div>
  );
}
