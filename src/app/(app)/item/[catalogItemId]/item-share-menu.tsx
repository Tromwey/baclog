"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { glassChipClass } from "@/components/ui/glass";
import { StrokeIcon } from "@/components/ui/stroke-icon";
import { SHARE_PATH } from "@/components/glyph-paths";
import { useItemReaction } from "./reaction-state";

/**
 * The item's ↗ share affordance — a two-way chooser instead of a direct jump to
 * the ticket. Panels portal to <body> so they escape the (app) content wrapper's
 * stacking context and sit ABOVE the dock (see backlog-menu.tsx / AGENTS.md).
 *
 *   · Compartir link  → Web Share the public item URL. The recipient lands on
 *     the F2.19 conversion page (hotlinked cover + link-out to every service +
 *     register CTA), so the artwork stays in the safe zone (ADR-008). Falls back
 *     to clipboard where Web Share is unavailable (desktop Firefox, etc.).
 *   · Compartir tarjeta → the existing ticket export (/item/{id}/card).
 *
 * The link row needs a public URL (claimed username + public profile); without
 * one the shared link would 404, so it degrades to a nudge instead.
 *
 * The card is only offered for a title in the library (read LIVE off the
 * provider, so a reaction that just added it unlocks the ticket at once): the
 * public item page resolves off `catalog_item` alone (no ownership join — see
 * modules/backlog/public.ts), so the LINK works for anything searchable, but
 * the ticket stamps a backlog name + status that a non-member simply doesn't
 * have. With one option left there's nothing to choose, so ↗ shares straight
 * away rather than opening a single-row panel.
 *
 * The chip is the shared 38px glass recipe with the mock's share glyph
 * (16px, stroke 2.2) — the same chip as the back control beside it.
 */
export function ItemShareMenu({
  itemId,
  title,
  publicUrl,
}: {
  itemId: string;
  title: string;
  publicUrl: string | null;
}) {
  const { inLibrary: canShareCard } = useItemReaction();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const shareLink = async (url: string) => {
    // F3.4 — fire-and-forget share signal (keepalive survives navigation)
    fetch("/api/analytics/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "link_share" }),
      keepalive: true,
    }).catch(() => {});
    try {
      if (navigator.share) {
        // URL-only so the target unfurls its own preview (cover hotlinked)
        await navigator.share({ title: `${title} · Baclog`, url });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flashToast("Link copiado");
    } catch {
      // clipboard blocked (insecure context / permissions) — nothing else to do
    }
  };

  const onLink = () => {
    setOpen(false);
    if (!publicUrl) {
      flashToast("Reclama tu username en Ajustes para compartir tu link.");
      return;
    }
    void shareLink(publicUrl);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (canShareCard ? setOpen((v) => !v) : onLink())}
        aria-label="Compartir"
        className={glassChipClass}
      >
        <StrokeIcon d={SHARE_PATH} size={16} strokeWidth={2.2} />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bl-rise bl-dock-glass absolute right-4 top-[calc(72px+env(safe-area-inset-top))] w-52 overflow-hidden rounded-[20px] py-1.5 text-sm shadow-[var(--shadow-glass)]"
            >
              <button
                onClick={onLink}
                className={`block w-full px-4 py-2.5 text-left hover:bg-white/5 ${
                  publicUrl ? "" : "text-text-3"
                }`}
              >
                Compartir link
              </button>
              <Link
                href={`/item/${itemId}/card`}
                onClick={() => setOpen(false)}
                className="block w-full px-4 py-2.5 text-left hover:bg-white/5"
              >
                Compartir tarjeta
              </Link>
            </div>
          </div>,
          document.body,
        )}

      {toast &&
        createPortal(
          <p className="bl-rise bl-dock-glass fixed left-1/2 top-[calc(72px+env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-text-2 shadow-[var(--shadow-glass)]">
            {toast}
          </p>,
          document.body,
        )}
    </>
  );
}
