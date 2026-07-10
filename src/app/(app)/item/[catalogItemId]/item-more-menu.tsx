"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  hideRecoProvenanceAction,
  removeItemAction,
} from "@/app/actions/backlog-item-actions";
import { useItemReaction } from "./reaction-state";

/**
 * ⋯ header menu (HANDOFF §8) — the quiet verdict layer: me gusta / no me gusta
 * toggles (re-tap clears), "Ocultar recomendación" for AI-sourced items, and
 * "Quitar del backlog". The ticket share lives on the header's own chip (mock
 * #p3), not in here. Portaled to <body> so it escapes the (app) content
 * wrapper's stacking context (see new-backlog-button.tsx).
 *
 * Reaction is a single field: picking a verdict while obsessed REPLACES the
 * obsession — the shared context keeps the big gesture in sync (and owns the
 * optimistic write via mutateReaction).
 */
export function ItemMoreMenu({
  backlogItemId,
  sourceCrossMediaRecId,
}: {
  backlogItemId: string;
  sourceCrossMediaRecId: string | null;
}) {
  const { reaction, mutateReaction, recoHidden, setRecoHidden } =
    useItemReaction();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const open = pos !== null;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setError(null);
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }
  const close = () => setPos(null);

  // The menu is portaled at coords captured on open; the page can still scroll
  // behind the transparent backdrop, so any scroll (capture catches the inner
  // overflow-y-auto containers too) closes it instead of letting it detach.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => setPos(null);
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, [open]);

  function pickVerdict(verdict: "liked" | "disliked") {
    setError(null);
    const next = reaction === verdict ? null : verdict;
    // Optimistic set + persist + safe revert live in the shared context.
    startTransition(async () => {
      const ok = await mutateReaction(next);
      if (!ok) setError("No se pudo guardar tu reacción.");
    });
  }

  function removeFromBacklog() {
    setError(null);
    startTransition(async () => {
      try {
        await removeItemAction(backlogItemId);
        close();
        // Entry becomes null → the logged-only controls vanish; the page
        // itself stays valid (it's keyed on the catalog item).
        router.refresh();
      } catch {
        setError("No se pudo quitar el ítem.");
      }
    });
  }

  function hideReco() {
    setRecoHidden(true); // optimistic — the panel/eyebrow vanish immediately
    close();
    startTransition(() =>
      hideRecoProvenanceAction(backlogItemId)
        .then((res) => {
          if ("error" in res) setRecoHidden(false);
        })
        .catch(() => setRecoHidden(false)),
    );
  }

  const rowBase =
    "flex w-full items-center justify-between gap-6 rounded-xl px-3.5 py-3 text-left text-sm transition-colors hover:bg-surface-3";
  const rowCls = `${rowBase} text-text`;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (open ? close() : openMenu())}
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/[0.28] text-text backdrop-blur-[18px]"
      >
        <svg width="20" height="6" viewBox="0 0 22 6" fill="currentColor" aria-hidden>
          <circle cx="3" cy="3" r="2.5" />
          <circle cx="11" cy="3" r="2.5" />
          <circle cx="19" cy="3" r="2.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={close}>
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="bl-rise fixed min-w-[230px] rounded-[18px] bg-surface-2 p-1.5 shadow-[var(--shadow-card)]"
              style={{ top: pos.top, right: pos.right }}
            >
              <button
                role="menuitemradio"
                aria-checked={reaction === "liked"}
                onClick={() => pickVerdict("liked")}
                className={rowCls}
              >
                Me gusta
                <StateDot active={reaction === "liked"} />
              </button>
              <button
                role="menuitemradio"
                aria-checked={reaction === "disliked"}
                onClick={() => pickVerdict("disliked")}
                className={rowCls}
              >
                No me gusta
                <StateDot active={reaction === "disliked"} />
              </button>
              {sourceCrossMediaRecId && !recoHidden && (
                <button role="menuitem" onClick={hideReco} className={rowCls}>
                  Ocultar recomendación
                </button>
              )}
              <button
                role="menuitem"
                onClick={removeFromBacklog}
                className={`${rowBase} text-hot`}
              >
                Quitar del backlog
              </button>
              {error && (
                <p className="px-3.5 pb-2 pt-1 text-xs text-red-400">{error}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function StateDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-[7px] w-[7px] flex-none rounded-full ${
        active ? "bg-accent" : "bg-transparent"
      }`}
    />
  );
}
