"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui";
import {
  deleteReviewAction,
  saveReviewAction,
} from "@/app/actions/review-actions";
import { useItemReaction } from "@/app/(app)/item/[catalogItemId]/reaction-state";
import {
  type ItemReviewContext,
  type ReviewMark,
} from "@/modules/reviews/types";
import { ReviewCard } from "./review-card";
import { ReviewFeed } from "./review-feed";
import { ReviewSheet } from "./review-sheet";

/**
 * F3.9 — the review block on the item detail, redrawn for the Revamp UI
 * (2026-09-03): a mono header "Reseñas · 38" with "Ver todas" on the right,
 * then glass cards. The viewer's own card is pinned first as "Tú".
 *
 * The LOCK is read from the live reaction context, not from the server props:
 * tapping "Me gustó" 200px above has to open this block in the same frame,
 * without a round-trip. The server re-checks the same rule in saveReviewAction —
 * this is the courtesy, that's the rule.
 *
 * WRITING happens in the Completar sheet (08): the unlocked-empty field opens
 * it, and so does "Completo" on the reaction row. EDITING an existing review
 * (from the card's ⋯) stays in the bottom ReviewSheet, because Publicar in 08
 * also marks the title complete, and editing a review must not change status.
 * The own review lives on the provider so both surfaces see the same one.
 */
export function ReviewsBlock({
  catalogItemId,
  itemTitle,
  allowSpoiler,
  viewerIsPublic,
  viewerHexes,
  viewerAvatarUrl,
  context,
}: {
  catalogItemId: string;
  itemTitle: string;
  /** False for albums — no ending to give away (see `supportsSpoiler`). */
  allowSpoiler: boolean;
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
  const {
    verdict,
    obsessed,
    ownReview: own,
    setOwnReview: setOwn,
    ensureInLibrary,
    openComplete,
  } = useItemReaction();
  const [sheet, setSheet] = useState<"edit" | "menu" | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [, startOpen] = useTransition();

  const unlocked = obsessed || verdict !== null;
  const mark: ReviewMark = obsessed
    ? "obsessed"
    : verdict === "liked"
      ? "liked"
      : verdict === "disliked"
        ? "disliked"
        : null;

  // The header count, DERIVED: the server total counted the own review iff it
  // was public and not hidden at load; adjust for what the own review is now.
  const counted = (r: { hidden: boolean } | null) =>
    r !== null && !r.hidden && viewerIsPublic ? 1 : 0;
  const total = context.total - counted(context.own) + counted(own);

  function write() {
    setError(null);
    startOpen(async () => {
      if (await ensureInLibrary()) openComplete();
    });
  }

  function save(body: string, hasSpoiler: boolean) {
    setError(null);
    startSaving(async () => {
      const res = await saveReviewAction({ catalogItemId, body, hasSpoiler });
      if ("error" in res) {
        setError(
          res.error === "link"
            ? "Los enlaces no van en una reseña. Quítalo y vuelve a intentarlo."
            : res.error === "locked"
              ? "Reacciona primero: me gustó, no me gustó u obsesión."
              : "No se pudo publicar. Tu texto sigue aquí — inténtalo otra vez.",
        );
        return;
      }
      setOwn({
        id: own?.id ?? "own",
        body,
        hasSpoiler,
        mark,
        when: "ahora",
        // Editing does NOT re-publish a review moderation hid (founder,
        // 2026-09-02) — the note on the card says exactly that.
        hidden: own?.hidden ?? false,
      });
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
        setOwn(null);
        setSheet(null);
        setArmed(false);
      } catch {
        setError("No se pudo eliminar.");
      }
    });
  }

  const pinned = (
    <>
      {/* 1 · bloqueado — no field, no button: the one thing to do is already
          on screen, on the reaction row. */}
      {!unlocked && !own && (
        <div className="rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
            Tu reseña
          </div>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-pretty text-text-2">
            Se abre cuando reacciones.
          </p>
        </div>
      )}

      {/* 2 · desbloqueado y vacío — looks like a field, opens Completar. */}
      {unlocked && !own && (
        <button
          type="button"
          onClick={write}
          className="flex w-full items-center justify-between gap-3 rounded-[18px] bg-[var(--glass-bg)] px-4 py-[15px] text-left"
        >
          <span className="text-[15px] text-text-3">
            {total === 0 ? "Escribe la primera…" : "Escribe tu reseña…"}
          </span>
        </button>
      )}

      {/* 3/4/5 · con reseña propia — pinned above the feed, never repeated
          inside it. */}
      {own &&
        (own.hidden ? (
          <div className="rounded-[18px] bg-[var(--glass-bg)] px-4 pb-4 pt-[15px] opacity-[0.72]">
            <div className="mb-[11px] flex items-center gap-2">
              <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-bad" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-3">
                Oculta por moderación
              </span>
            </div>
            <p className="text-[15px] leading-[1.5] text-pretty text-text-2">{own.body}</p>
            <p className="mt-[10px] text-xs leading-[1.45] text-text-3">
              Ya no aparece en el feed, y editarla no la vuelve a publicar.{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSheet("edit");
                }}
                className="text-accent"
              >
                Editarla
              </button>
            </p>
          </div>
        ) : (
          <ReviewCard
            key={own.id}
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
            displayName="Tú"
            alwaysRevealed
            menuLabel="Opciones de tu reseña"
            onMenu={() => {
              setArmed(false);
              setSheet("menu");
            }}
          >
            {!viewerIsPublic && (
              <p className="text-xs leading-[1.45] text-text-3">
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
        <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-hot">{error}</p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <ReviewFeed
        catalogItemId={catalogItemId}
        initialReviews={context.reviews}
        initialCursor={context.nextCursor}
        canReport
        allowSpoiler={allowSpoiler}
        renderHeader={({ hasMore, loading, loadMore }) => (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-3">
              {total > 0 ? `Reseñas · ${total}` : "Reseñas"}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-2 transition-opacity disabled:opacity-50"
              >
                {loading ? "Cargando…" : "Ver todas"}
              </button>
            )}
          </div>
        )}
        pinned={pinned}
        emptyNote={
          <p className="text-[14px] leading-[1.5] text-text-3">
            {own
              ? "Nadie más ha escrito todavía. Cuando lo hagan, aparecen aquí."
              : "Nadie ha escrito todavía. Aquí empieza la conversación."}
          </p>
        }
      />

      {sheet === "edit" && own && (
        <ReviewSheet
          itemTitle={itemTitle}
          initialBody={own.body}
          initialHasSpoiler={own.hasSpoiler}
          allowSpoiler={allowSpoiler}
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
              type="button"
              onClick={() => {
                setError(null);
                setSheet("edit");
              }}
              className="w-full rounded-[14px] bg-surface-2 px-4 py-[14px] text-left text-[14.5px] text-text transition-colors hover:bg-surface-3"
            >
              Editar
            </button>
            {/* Two-tap confirm — a dialog to delete 280 characters would be
                out of scale. */}
            <button
              type="button"
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
