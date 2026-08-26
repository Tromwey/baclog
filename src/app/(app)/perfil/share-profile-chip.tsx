"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";
import { glassChipClass } from "@/components/ui";

/**
 * F3.10 (design 2a) — the share chip in /perfil's header: Web Share of the
 * public profile URL, clipboard fallback with a brief check as the receipt.
 * Only rendered when the profile is actually reachable (username AND isPublic
 * — the page gates it; sharing a URL that 404s would be worse than no chip).
 */
export function ShareProfileChip({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://baclog.app/${username}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (err) {
        // Only a user cancellation ends the interaction. Anything else
        // (desktop Chrome with no share targets, an embedded webview without
        // web-share permission) falls through to the clipboard — the branch
        // those environments actually need.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard denied: nothing sensible to do silently.
    }
  }

  return (
    <button
      onClick={share}
      aria-label="Compartir tu perfil"
      className={glassChipClass}
    >
      {copied ? (
        <Check size={19} className="text-accent" />
      ) : (
        <Share size={19} strokeWidth={1.9} />
      )}
    </button>
  );
}
