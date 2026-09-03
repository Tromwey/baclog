"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui";
import {
  deleteReviewAction,
  saveReviewAction,
} from "@/app/actions/review-actions";
import { useItemReaction } from "@/app/(app)/item/[catalogItemId]/reaction-state";
import { ownMarkLabel } from "@/modules/reviews/format";
import {
  REVIEW_MAX_LENGTH,
  type ItemReviewContext,
  type OwnReview,
  type ReviewMark,
} from "@/modules/reviews/types";
import { ReviewCard } from "./review-card";
import { ReviewFeed } from "./review-feed";
import { ReviewSheet } from "./review-sheet";

/**
 * F3.9 — the review block on the item detail, between the "Me obsesiona"
 * gesture and the AI-provenance panel. Always opens with the same hairline and
 * the same mono label so it's recognizable before it's read.
 *
 * The LOCK is read from the live reaction context, not from the server props:
 * tapping "Me obsesiona" 200px above has to open this block in the same frame,
 * without a round-trip. The server re-checks the same rule in saveReviewAction —
 * this is the courtesy, that's the rule.
 */
export function ReviewsBlock({
  catalogItemId,
  itemTitle,
  allowSpoiler,
  inLibrary,
  viewerIsPublic,
  viewerHexes,
  viewerAvatarUrl,
  context,
}: {
  catalogItemId: string;
  itemTitle: string;
  /** False for albums — no ending to give away (see `supportsSpoiler`). */
  allowSpoiler: boolean;
  /** The title has to be in the library before there's anything to react to. */
  inLibrary: boolean;
  /**
   * Claimed handle + isPublic. A private viewer writes normally, but their
   * review never enters a feed, so it never enters the count either — and the
   * card tells them so. This describes the VIEWER, not the review: it has to be
   * known BEFORE the first one is written.
   */
  viewerIsPublic: boolean;
  /** The viewer's own two ADN colors, for their avatar on their own card. */
  viewerHexes: [string, string];
  /** F3.11 — the viewer's own photo, over the orb when they have one. */
  viewerAvatarUrl: string | null;
  context: ItemReviewContext;
}) {
  const { verdict, obsessed } = useItemReaction();
  const [own, setOwn] = useState<OwnReview | null>(context.own);
  const [total, setTotal] = useState(context.total);
  const [sheet, setSheet] = useState<"write" | "menu" | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const unlocked = inLibrary && (obsessed || verdict !== null);
  const mark: ReviewMark = obsessed
    ? "obsessed"
    : verdict === "liked"
      ? "liked"
      : verdict === "disliked"
        ? "disliked"
        : null;
  // A private author's review never entered the count, so it can't leave it.
  const countsInFeed = viewerIsPublic;

  function save(body: string, hasSpoiler: boolean) {
    setError(null);
    startSaving(async () => {
      const res = await saveReviewAction({ catalogItemId, body, hasSpoiler });
      if ("error" in res) {
        setError(
          res.error === "link"
            ? "Los enlaces no van en una reseña. Quítalo y vuelve a intentarlo."
            : res.error === "locked"
              ? "Reacciona primero: me gusta, no me gusta o me obsesiona."
              : "No se pudo publicar. Tu texto sigue aquí — inténtalo otra vez.",
        );
        return;
      }
      const isNew = own === null;
      setOwn({
        id: own?.id ?? "own",
        body,
        hasSpoiler,
        mark,
        when: "ahora",
        // Editing re-publishes (the action clears hidden_at), which is exactly
        // what the moderation note promised the author.
        hidden: false,
      });
      if (isNew && countsInFeed) setTotal((n) => n + 1);
      setSheet(null);
    });
  }

  function remove() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startSaving(async () => {
      try {
        await deleteReviewAction(catalogItemId);
        if (own && !own.hidden && countsInFeed) setTotal((n) => Math.max(0, n - 1));
        setOwn(null);
        setSheet(null);
        setArmed(false);
      } catch {
        setError("No se pudo eliminar.");
      }
    });
  }

  return (
    <div className="relative mt-7 px-5">
      <div className="mb-[18px] h-px bg-line" />
      <div className="mb-[14px] flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
          Reseñas
        </span>
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-3">
          {total > 0 ? total : "—"}
        </span>
      </div>

      {/* 1 · bloqueado — no field, no button: the one thing to do is already
          on screen, 200px above. */}
      {inLibrary && !unlocked && !own && (
        <div className="rounded-[18px] bg-surface-1 px-[18px] py-4">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-3">
            Tu reseña
          </div>
          <p className="mt-2 text-[14.5px] leading-[1.5] text-pretty text-text-2">
            Se abre cuando reacciones. Me gusta, no me gusta o me obsesiona — con
            eso basta.
          </p>
        </div>
      )}

      {/* 2 · desbloqueado y vacío — looks like a field, opens the sheet.
          Writing never happens on the page. */}
      {unlocked && !own && (
        <button
          onClick={() => {
            setError(null);
            setSheet("write");
          }}
          className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-surface-3 px-4 py-[15px] text-left"
        >
          <span className="text-[14.5px] text-text-3">
            {total === 0 ? "Escribe la primera…" : "Escribe tu reseña…"}
          </span>
          <span className="font-mono text-[10px] tracking-[0.06em] text-text-3">
            {REVIEW_MAX_LENGTH}
          </span>
        </button>
      )}

      {/* 3/4/5 · con reseña propia — pinned above the feed, never repeated
          inside it. */}
      {own &&
        (own.hidden ? (
          <div className="rounded-[18px] bg-surface-1 px-4 pb-4 pt-[15px] opacity-[0.72]">
            <div className="mb-[11px] flex items-center gap-2">
              <span
                aria-hidden
                className="h-[7px] w-[7px] flex-none rounded-full bg-bad"
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
                Oculta por moderación
              </span>
            </div>
            <p className="text-[14.5px] leading-[1.52] text-pretty text-text-2">
              {own.body}
            </p>
            <p className="mt-[10px] text-xs leading-[1.45] text-text-3">
              Ya no aparece en el feed, y editarla no la vuelve a publicar.{" "}
              <button
                onClick={() => {
                  setError(null);
                  setSheet("write");
                }}
                className="text-accent"
              >
                Editarla
              </button>
            </p>
          </div>
        ) : (
          <ReviewCard
            body={own.body}
            hasSpoiler={own.hasSpoiler}
            mark={mark}
            when={own.when}
            author={{
              username: "",
              initial: "T",
              avatarHexes: viewerHexes,
              avatarUrl: viewerAvatarUrl,
            }}
            markLabel={ownMarkLabel(mark)}
            displayName="Tú"
            alwaysRevealed
            menuLabel="Opciones de tu reseña"
            onMenu={() => {
              setArmed(false);
              setSheet("menu");
            }}
          >
            {!viewerIsPublic && (
              <p className="mt-[10px] text-xs leading-[1.45] text-text-3">
                Solo tú la ves.{" "}
                <Link href="/settings" className="text-accent">
                  Hazte público en Ajustes
                </Link>{" "}
                y entra a la conversación.
              </p>
            )}
          </ReviewCard>
        ))}

      {error && !sheet && (
        <p className="mt-3 text-[13px] leading-[1.45] text-hot">{error}</p>
      )}

      <ReviewFeed
        catalogItemId={catalogItemId}
        initialReviews={context.reviews}
        initialCursor={context.nextCursor}
        canReport
        allowSpoiler={allowSpoiler}
        emptyNote={
          <p className="mt-[18px] text-sm leading-[1.5] text-text-3">
            {own
              ? "Nadie más ha escrito todavía. Cuando lo hagan, aparecen aquí."
              : "Nadie ha escrito todavía. Aquí empieza la conversación."}
          </p>
        }
      />

      {sheet === "write" && (
        <ReviewSheet
          itemTitle={itemTitle}
          initialBody={own?.body ?? ""}
          initialHasSpoiler={own?.hasSpoiler ?? false}
          allowSpoiler={allowSpoiler}
          isEdit={own !== null}
          saving={saving}
          error={error}
          onCancel={() => setSheet(null)}
          onSave={save}
        />
      )}

      {sheet === "menu" && (
        <Sheet onClose={() => setSheet(null)} label="Opciones de tu reseña">
          <div className="font-display text-[18px] font-bold tracking-[-0.01em] text-text">
            Tu reseña
          </div>
          <div className="mt-[14px] flex flex-col gap-2">
            <button
              onClick={() => {
                setError(null);
                setSheet("write");
              }}
              className="w-full rounded-[14px] bg-surface-2 px-4 py-[14px] text-left text-[14.5px] text-text transition-colors hover:bg-surface-3"
            >
              Editar
            </button>
            {/* Two-tap confirm, same as "Quitar de mi biblioteca" in the item ⋯
                menu. A dialog to delete 280 characters would be out of scale. */}
            <button
              onClick={remove}
              disabled={saving}
              className="w-full rounded-[14px] bg-surface-2 px-4 py-[14px] text-left text-[14.5px] text-hot transition-colors hover:bg-surface-3"
            >
              {armed ? "Toca de nuevo para eliminar" : "Eliminar"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
