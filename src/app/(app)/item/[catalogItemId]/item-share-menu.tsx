"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

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
 * `canShareCard` is false for a title the user hasn't added: the public item
 * page resolves off `catalog_item` alone (no ownership join — see
 * modules/backlog/public.ts), so the LINK works for anything searchable, but the
 * ticket stamps a backlog name + status that a non-member simply doesn't have.
 * With one option left there's nothing to choose, so ↗ shares straight away
 * rather than opening a single-row panel.
 */
export function ItemShareMenu({
  itemId,
  title,
  publicUrl,
  canShareCard,
}: {
  itemId: string;
  title: string;
  publicUrl: string | null;
  canShareCard: boolean;
}) {
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
        onClick={() => (canShareCard ? setOpen((v) => !v) : onLink())}
        aria-label="Compartir"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/[0.28] text-text backdrop-blur-[18px]"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8 7l4-4 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bl-rise absolute right-4 top-[calc(72px+env(safe-area-inset-top))] w-52 overflow-hidden rounded-[20px] bg-surface-2/90 py-1.5 text-sm shadow-[var(--shadow-card)] backdrop-blur-[28px] backdrop-saturate-[1.25]"
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
          <p className="bl-rise fixed left-1/2 top-[calc(72px+env(safe-area-inset-top))] z-50 -translate-x-1/2 rounded-full bg-surface-2/90 px-4 py-2 text-xs text-text-2 backdrop-blur-[28px]">
            {toast}
          </p>,
          document.body,
        )}
    </>
  );
}
