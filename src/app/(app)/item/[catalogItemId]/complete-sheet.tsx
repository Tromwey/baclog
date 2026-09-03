"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { completeItemAction, type CompleteReaction } from "@/app/actions/complete-actions";
import { CoverTile, coverAspect } from "@/components/cover-tile";
import { PaletteGlow } from "@/components/ui/palette-glow";
import { Segmented } from "@/components/ui/segmented";
import { StateGlyph } from "@/components/ui/state-glyph";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import type { MediaType } from "@/modules/catalog/types";
import { REVIEW_MAX_LENGTH } from "@/modules/reviews/types";
import { DONE_VERB, KIND_LABEL, todayShort } from "./labels";
import { useItemReaction, type ItemVerdictValue } from "./reaction-state";

/**
 * 08 · Completar (Revamp UI, 2026-09-03) — marking a title complete, saying
 * what you thought, and (optionally) the review, in ONE full-screen overlay
 * instead of a bottom sheet: it's the one moment the app asks for a
 * paragraph, so it gets the whole screen and the title's own light behind it.
 *
 * Portaled to <body> (the (app) wrapper traps fixed surfaces under the dock —
 * AGENTS.md) and hydration-guarded like Sheet. Escape closes; the keyboard
 * inset pads the column so the field and the ticket row stay reachable.
 *
 * One server call on Publicar (completeItemAction): status → reaction →
 * review. The three reaction choices are the mock's — "No me gustó" lives
 * ONLY here, never on the page's row. A review needs a reaction (the F3.9
 * unlock rule, re-checked by the action): with text and no choice, the sheet
 * says so inline and keeps Publicar off instead of letting the server refuse.
 *
 * 280, not the mock's 600: REVIEW_MAX_LENGTH is the column and the action's
 * limit — flagged for the founder rather than silently widened here.
 */

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export interface CompleteItem {
  id: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  posterUrl: string | null;
  paletteHex: string[] | null;
}

/** Mounted from the page; renders the sheet while the provider says it's open. */
export function CompleteSheetHost({
  item,
  allowSpoiler,
}: {
  item: CompleteItem;
  allowSpoiler: boolean;
}) {
  const { completeOpen } = useItemReaction();
  if (!completeOpen) return null;
  return <CompleteSheet item={item} allowSpoiler={allowSpoiler} />;
}

function CompleteSheet({
  item,
  allowSpoiler,
}: {
  item: CompleteItem;
  allowSpoiler: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const keyboardInset = useKeyboardInset();
  const {
    catalogItemId,
    verdict,
    obsessed,
    ownReview,
    setOwnReview,
    settleFromComplete,
    ensureInLibrary,
    closeComplete,
  } = useItemReaction();

  // Pre-select from the current state (obsessed › verdict) and pre-fill the
  // existing review, so re-opening on a completed title is an edit.
  const [reaction, setReaction] = useState<CompleteReaction>(
    obsessed ? "obsessed" : verdict,
  );
  const [body, setBody] = useState(ownReview?.body ?? "");
  const [hasSpoiler, setHasSpoiler] = useState(
    allowSpoiler && (ownReview?.hasSpoiler ?? false),
  );
  const [shareTicket, setShareTicket] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeComplete();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under a full-screen surface.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [closeComplete]);

  const over = body.length > REVIEW_MAX_LENGTH;
  const hasText = body.trim().length > 0;
  const needsReaction = hasText && reaction === null;
  const canPublish = !saving && !over && !needsReaction;

  function publish() {
    if (!canPublish) return;
    setError(null);
    startSaving(async () => {
      const inLibrary = await ensureInLibrary();
      if (!inLibrary) {
        setError("Elige un backlog para guardar el título.");
        return;
      }
      const res = await completeItemAction({
        catalogItemId,
        reaction,
        body: body.trim(),
        hasSpoiler: allowSpoiler && hasSpoiler,
      });
      if ("error" in res) {
        setError(
          res.error === "link"
            ? "Los enlaces no van en una reseña. Quítalo y vuelve a intentarlo."
            : res.error === "locked"
              ? "Elige qué te pareció para publicar la reseña."
              : "No se pudo publicar. Tu texto sigue aquí — inténtalo otra vez.",
        );
        return;
      }

      // Mirror the one write locally (the provider is NOT remounted on
      // refresh — see reaction-state.tsx).
      const nextVerdict: ItemVerdictValue =
        reaction === "obsessed" || reaction === null ? verdict : reaction;
      const nextObsessed =
        reaction === "obsessed" ? true : reaction === null ? obsessed : false;
      settleFromComplete({ verdict: nextVerdict, obsessed: nextObsessed });
      if (hasText) {
        setOwnReview({
          id: ownReview?.id ?? "own",
          body: body.trim(),
          hasSpoiler: allowSpoiler && hasSpoiler,
          mark: nextObsessed ? "obsessed" : nextVerdict,
          when: "ahora",
          // Editing never re-publishes a hidden review (founder, 2026-09-02).
          hidden: ownReview?.hidden ?? false,
        });
      }
      closeComplete();
      router.refresh();
      if (shareTicket) router.push(`/item/${item.id}/card`);
    });
  }

  if (!hydrated) return null;

  const kind = KIND_LABEL[item.mediaType];
  const meta = [kind, item.year, `${DONE_VERB[item.mediaType]} el ${todayShort()}`]
    .filter(Boolean)
    .join(" · ");
  const palette = item.paletteHex ?? [];
  const bar1 = palette[0] ?? "var(--surface-3)";
  const bar2 = palette[1] ?? palette[0] ?? "var(--surface-2)";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Completar"
      className="bl-fade-in fixed inset-0 z-50 overflow-hidden bg-bg text-text"
    >
      <PaletteGlow hexes={palette} opacity={0.45} blur={90} className="-inset-[60px]" />

      <div
        className="bl-scroll relative flex h-full flex-col gap-[18px] overflow-y-auto overscroll-contain px-5 pb-[30px] pt-[calc(12px+env(safe-area-inset-top))]"
        style={
          keyboardInset > 0 ? { paddingBottom: `${keyboardInset + 16}px` } : undefined
        }
      >
        <header className="flex flex-none items-center justify-between">
          <button
            type="button"
            onClick={closeComplete}
            className="py-1 text-[14px] text-text-2"
          >
            Cancelar
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-2">
            Completar
          </span>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className="py-1 text-[14px] font-semibold text-accent transition-opacity disabled:opacity-40"
          >
            {saving ? "Publicando…" : "Publicar"}
          </button>
        </header>

        <div className="flex flex-none items-center gap-3.5">
          <CoverTile
            posterUrl={item.posterUrl}
            paletteHex={item.paletteHex}
            alt=""
            className={`w-16 ${coverAspect(item.mediaType)}`}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-serif text-[30px] italic leading-[1.02] text-pretty">
              {item.title}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
              {meta}
            </span>
          </div>
        </div>

        <div className="flex flex-none flex-col gap-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
            ¿Qué te pareció?
          </span>
          <Segmented
            variant="actions"
            ariaLabel="¿Qué te pareció?"
            value={reaction}
            onSelect={(key) =>
              setReaction((prev) =>
                prev === key ? null : (key as Exclude<CompleteReaction, null>),
              )
            }
            segments={[
              {
                key: "disliked",
                label: "No me gustó",
                icon: <StateGlyph kind="disliked" size={11} />,
              },
              { key: "liked", label: "Me gustó", icon: <StateGlyph kind="liked" size={11} /> },
              {
                key: "obsessed",
                label: "Obsesión",
                icon: <StateGlyph kind="obsessed" size={10} />,
              },
            ]}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
            Reseña · opcional
          </span>
          <div className="flex min-h-[120px] flex-1 rounded-[18px] bg-[var(--glass-bg)] p-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="¿Qué se te quedó?"
              aria-label="Tu reseña"
              className="h-full w-full resize-none bg-transparent text-[16px] leading-[1.5] text-pretty text-text caret-accent outline-none placeholder:text-text-3"
            />
          </div>
          <div className="flex items-center justify-between px-1">
            {allowSpoiler ? (
              <button
                type="button"
                role="switch"
                aria-checked={hasSpoiler}
                onClick={() => setHasSpoiler((v) => !v)}
                className="flex items-center gap-2.5"
              >
                <Toggle on={hasSpoiler} />
                <span className="text-[13px] text-text-2">Contiene spoiler</span>
              </button>
            ) : (
              <span />
            )}
            <span
              className={`font-mono text-[10.5px] uppercase tracking-[0.1em] ${
                over ? "text-hot" : "text-text-3"
              }`}
            >
              {body.length} / {REVIEW_MAX_LENGTH}
            </span>
          </div>
          {needsReaction && !error && (
            <p className="px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2">
              Elige qué te pareció para publicar la reseña
            </p>
          )}
          {error && (
            <p className="px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-hot">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={shareTicket}
          onClick={() => setShareTicket((v) => !v)}
          className="flex flex-none items-center gap-3 rounded-[18px] bg-surface-1 px-3.5 py-3 text-left"
        >
          <span
            aria-hidden
            className="flex h-14 w-11 flex-none flex-col justify-between rounded-[6px] bg-bg p-[5px]"
          >
            <span className="font-mono text-[6px] tracking-[0.08em] text-text-3">TICKET</span>
            <span className="flex h-1">
              <span className="flex-1" style={{ background: bar1 }} />
              <span className="flex-1" style={{ background: bar2 }} />
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-[13.5px] font-semibold text-text">
              Compartir ticket al publicar
            </span>
            <span className="text-[12px] text-text-3">Se genera con tu paleta</span>
          </span>
          <Toggle on={shareTicket} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** The mock's 36×22 switch: surface-2 track + text-3 knob off, accent + bg knob on. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block h-[22px] w-9 flex-none rounded-full transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] ${
        on ? "bg-accent" : "bg-surface-2"
      }`}
    >
      <span
        className={`absolute top-[2px] rounded-full transition-[left,width,height] duration-[var(--dur-base)] ease-[var(--ease-out)] ${
          on ? "left-4 h-[18px] w-[18px] bg-bg" : "left-[2px] h-4 w-4 bg-text-3"
        }`}
      />
    </span>
  );
}
