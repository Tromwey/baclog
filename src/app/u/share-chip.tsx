"use client";

import { useState } from "react";
import { glassChipClass, StrokeIcon } from "@/components/ui";
import { CHECK_PATH, SHARE_PATH } from "@/components/glyph-paths";

/**
 * The share chip of the public surfaces (Revamp UI 06b/10, 2026-09-03): the
 * mock's 38px glass chip with the share glyph. Web Share of `path` resolved
 * against the current origin (so it shares whatever host it's running on),
 * clipboard fallback with a brief lima check as the receipt.
 */
export function ShareChip({
  path,
  label,
  className = "",
}: {
  /** Absolute path ("/u/dan") or a full URL. */
  path: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (err) {
        // Only a user cancellation ends the interaction; anything else
        // (desktop with no share targets, a webview without the permission)
        // falls through to the clipboard.
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
      type="button"
      onClick={share}
      aria-label={label}
      className={`${glassChipClass} ${className}`}
    >
      {copied ? (
        <StrokeIcon d={CHECK_PATH} size={16} strokeWidth={2.6} className="text-accent" />
      ) : (
        <StrokeIcon d={SHARE_PATH} size={16} strokeWidth={2.2} />
      )}
    </button>
  );
}
