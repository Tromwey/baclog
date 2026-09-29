import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Creepster, JetBrains_Mono, Manrope } from "next/font/google";
import { PARTY_EVENT } from "@/modules/party/event";
import { PartyClient } from "./party-client";
import "./party.css";

/*
 * /party — an interactive invitation hosted inside Kura but outside its
 * design system on purpose: it's its own world (the design's fonts and
 * palette, borders and glows included). Public, no session; RSVPs land in
 * `party_rsvp` and the host reads them in Torre › /admin/party.
 */

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--pt-serif",
  display: "swap",
});
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--pt-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--pt-mono", display: "swap" });
const creep = Creepster({ subsets: ["latin"], weight: "400", variable: "--pt-creep", display: "swap" });

export const metadata: Metadata = {
  title: `${PARTY_EVENT.title} · Entra si te atreves`,
  description: "Estás invitado. Cruza la reja, encuentra los 5 secretos entre las tumbas y confirma.",
  robots: { index: false, follow: false },
  openGraph: {
    title: `${PARTY_EVENT.title} — entra si te atreves`,
    description: "Estás invitado. Cruza la reja y encuentra los 5 secretos entre las tumbas.",
    url: "/party",
  },
};

/** Safari's bars take the invitation's black instead of Kura's. */
export const viewport: Viewport = { themeColor: "#050404" };

export default function PartyPage() {
  return (
    <div className={`party ${serif.variable} ${sans.variable} ${mono.variable} ${creep.variable}`}>
      <PartyClient />
    </div>
  );
}
