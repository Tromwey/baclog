"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HERO_LEAD, PartyFan } from "@/components/party/party-parts";
import { BRIDGE_QUERY, BRIDGE_VALUE, PARTY_TOKENS } from "@/components/party/party-tokens";
import { fanBox } from "@/components/kura/fan";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getPartyPlaylistAction } from "./party-playlist-actions";

/**
 * The card after the RSVP (fiesta-app-v2 · isParty): "Arma la playlist de la
 * fiesta en kura" in /party's own ink (`--p-*`, party-tokens.ts), with the
 * party's first records, "Abrir la playlist en kura" and the live presence
 * line ("8 canciones · @ana, @rodri y 2 más ya están dentro").
 *
 * Self-loading: without `summary` it asks `getPartyPlaylistAction` (env
 * `PARTY_PLAYLIST_TOKEN`); no party behind the token → renders nothing.
 *
 * The bridge OUT: the card's fan lifts off to the spot where /f/{token}'s
 * hero starts its own flight (centred, 55 % down, at .56), the party's ink
 * covers the screen with "Te llevamos a la playlist…", and the landing
 * (`?from=party`) plays the second half (invite-landing.tsx · useBridgeIn).
 */

export interface PartyPlaylistSummary {
  /** `/f/{token}`. */
  href: string;
  /** `presenceLine(summary)`. */
  line: string;
  /** `playlistPitch(perGuestLimit)` — "Pon tus 3 canciones. …" (the real cap). */
  pitch: string;
  artworkUrls: string[];
}

const CARD_LEAD = 72;
const SCALE = 0.56;

export function PartyPlaylistCard({
  summary: given,
  className = "",
}: {
  summary?: PartyPlaylistSummary | null;
  className?: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState<PartyPlaylistSummary | null>(null);
  const summary = given !== undefined ? given : loaded;
  const fanRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ from: string; go: boolean } | null>(null);

  useEffect(() => {
    if (given !== undefined) return;
    let off = false;
    getPartyPlaylistAction()
      .then((s) => {
        if (!off) setLoaded(s);
      })
      .catch((err) => {
        // The card simply doesn't show — but say why in the console.
        console.error("[party] /party playlist card: getPartyPlaylistAction failed", err);
      });
    return () => {
      off = true;
    };
  }, [given]);

  if (!summary) return null;
  const songs = summary.artworkUrls.slice(0, 3).map((url) => ({ artworkUrl: url, paletteHex: null, title: "" }));
  const target = `${summary.href}?${BRIDGE_QUERY}=${BRIDGE_VALUE}`;

  const open = () => {
    if (flight) return;
    const el = fanRef.current;
    if (reduced || !el) {
      router.push(target);
      return;
    }
    const r = el.getBoundingClientRect();
    const hero = fanBox(HERO_LEAD);
    const s0 = r.width / hero.width;
    setFlight({ from: `translate(${r.left}px, ${r.top}px) scale(${s0})`, go: false });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setFlight((f) => (f ? { ...f, go: true } : f))),
    );
    router.prefetch(summary.href);
    setTimeout(() => router.push(target), 560);
  };

  const hero = fanBox(HERO_LEAD);
  const landing =
    typeof window === "undefined"
      ? "none"
      : `translate(${(window.innerWidth - hero.width * SCALE) / 2}px, ${window.innerHeight * 0.55}px) scale(${SCALE})`;

  return (
    <div
      style={{ ...PARTY_TOKENS, background: "var(--p-surface)" }}
      className={`flex flex-col gap-3.5 rounded-[28px] px-5 pb-5 pt-6 ${className}`}
    >
      <div ref={fanRef} className="flex justify-center pt-1" style={{ opacity: flight ? 0 : 1 }}>
        <PartyFan songs={songs} empty={songs.length === 0} lead={CARD_LEAD} />
      </div>
      <div
        className="text-center font-brand text-[26px] leading-[1.1] [text-wrap:balance]"
        style={{ color: "var(--p-bone)" }}
      >
        Arma la playlist de la fiesta en kura
      </div>
      <div
        className="text-center font-sans text-[15px] leading-[1.45] [text-wrap:pretty]"
        style={{ color: "var(--p-bone-2)" }}
      >
        {summary.pitch}
      </div>
      <button
        type="button"
        onClick={open}
        className="flex h-14 items-center justify-center gap-2 rounded-full font-sans text-[16px] font-semibold transition-colors"
        style={{ background: "var(--p-bone)", color: "var(--p-bg)" }}
      >
        Abrir la playlist <span className="font-medium opacity-60">en kura</span>
      </button>
      <div
        className="text-center font-mono text-[10px] uppercase tracking-[0.04em] [text-wrap:balance]"
        style={{ color: "var(--p-bone-2)" }}
      >
        {summary.line}
      </div>
      {flight &&
        createPortal(
          <div aria-hidden className="pointer-events-none fixed inset-0 z-[200]" style={PARTY_TOKENS}>
            <div
              className="absolute inset-0"
              style={{ background: "var(--p-bg)", opacity: flight.go ? 1 : 0, transition: "opacity 300ms ease" }}
            />
            <div
              className="absolute inset-x-0 top-[43%] text-center font-brand text-[20px]"
              style={{ color: "var(--p-bone)", opacity: flight.go ? 1 : 0, transition: "opacity 280ms 120ms" }}
            >
              Te llevamos a la playlist…
            </div>
            <div
              className="absolute left-0 top-0"
              style={{
                transformOrigin: "0 0",
                transform: flight.go ? landing : flight.from,
                transition: flight.go ? "transform 520ms cubic-bezier(.2,.85,.25,1)" : "none",
              }}
            >
              <PartyFan songs={songs} empty={songs.length === 0} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
