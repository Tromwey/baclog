"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  deleteReviewAction,
  saveReviewAction,
} from "@/app/actions/review-actions";
import { useItemReaction } from "@/app/(app)/item/[catalogItemId]/reaction-state";
import { KuraSheet } from "@/app/(app)/item/[catalogItemId]/kura-sheet";
import {
  type ItemReviewContext,
  type ReviewMark,
} from "@/modules/reviews/types";
import { ReviewCard } from "./review-card";
import { ReviewFeed } from "./review-feed";
import { ReviewSheet } from "./review-sheet";

/**
 * F3.9 — "reseñas" on the ficha (Kura 24a, 2026-09-24): the section title in
 * Newsreader 24 with the count — or "Ver las N" while more pages exist — in
 * mono at the right, then `--s1` cards. The viewer's own card is pinned first
 * as "Tú".
 *
 * The LOCK is read from the live reaction context, not from the server props
 * (the server re-checks the same rule in saveReviewAction — this is the
 * courtesy, that's the rule). Writing happens in the Completar sheet: the
 * unlocked-empty field opens it, and so does Reseñar in the header. EDITING
 * an existing review (the card's ⋯, or Reseñar when you already wrote one)
 * opens the edit sheet, because saving in Completar also marks the status.
 * Which review sheet is open lives on the provider so Reseñar can open it.
 *
 * The whole section hides when there's nothing to read and nothing you can
 * write yet (24d draws no reseñas block on a title nobody reviewed).
 */
export function ReviewsBlock({
  catalogItemId,
  itemTitle,
  allowSpoiler,
  viewerIsPublic,
  viewerHexes,
  viewerAvatarUrl,
  viewerName,
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
  /** The viewer's handle (or name) — their seal's initials on their own card. */
  viewerName?: string;
  context: ItemReviewContext;
}) {
  const {
    verdict,
    obsessed,
    ownReview: own,
    setOwnReview: setOwn,
    openComplete,
    reviewSheet: sheet,
    setReviewSheet: setSheet,
  } = useItemReaction();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

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
    openComplete();
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
              ? "Para publicar tu reseña, elige Me gusta o Me obsesiona al completar."
              : "No se pudo guardar. Tu texto sigue aquí: inténtalo otra vez.",
        );
        return;
      }
      setOwn({
        id: own?.id ?? "own",
        body,
        hasSpoiler,
        mark,
        when: "ahora",
        // Client clock, on purpose: the optimistic copy lives until the
        // next server read brings the real instants.
        createdAt: own?.createdAt ?? new Date(),
        updatedAt: new Date(),
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
        setError("No se pudo borrar tu reseña. Inténtalo otra vez.");
      }
    });
  }

  const pinned = (
    <>
      {/* desbloqueado y vacío — looks like a field, opens Completar. Locked
          (no reaction yet) draws nothing: Reseñar and Completar are right
          there in the header. */}
      {unlocked && !own && (
        <button
          type="button"
          onClick={write}
          className="flex min-h-[52px] w-full items-center rounded-[var(--r-surface)] bg-white/[0.06] px-4 text-left transition-colors active:bg-white/[0.1]"
        >
          <span className="text-[15px] text-text-2">
            {total === 0 ? "Escribe la primera reseña" : "Escribe tu reseña"}
          </span>
        </button>
      )}

      {/* con reseña propia — pinned above the feed, never repeated inside it. */}
      {own &&
        (own.hidden ? (
          <div className="flex flex-col gap-3 rounded-[var(--r-surface)] bg-surface-1 p-[18px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
              Oculta por moderación
            </span>
            <p className="text-[15px] leading-[1.55] text-pretty text-text-2">{own.body}</p>
            <p className="text-[13px] leading-[1.45] text-text-2">
              Ya no aparece en el feed, y editarla no la vuelve a publicar.{" "}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSheet("edit");
                }}
                className="font-semibold text-text transition-opacity active:opacity-60"
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
              username: viewerName ?? "",
              initial: (viewerName ?? "T").charAt(0).toUpperCase(),
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
              <p className="text-[13px] leading-[1.45] text-text-2">
                Solo tú la ves.{" "}
                <Link href="/settings" className="font-semibold text-text transition-opacity active:opacity-60">
                  Haz público tu perfil en Ajustes
                </Link>{" "}
                para entrar a la conversación.
              </p>
            )}
          </ReviewCard>
        ))}

      {error && !sheet && <p className="text-[14px] leading-[1.4] text-text-2">{error}</p>}
    </>
  );

  if (total === 0 && !own && !unlocked && context.reviews.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <ReviewFeed
        catalogItemId={catalogItemId}
        initialReviews={context.reviews}
        initialCursor={context.nextCursor}
        canReport
        allowSpoiler={allowSpoiler}
        renderHeader={({ hasMore, loading, loadMore }) => (
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-brand text-[24px] leading-[1.1] text-text">reseñas</h2>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60 disabled:opacity-60"
              >
                {loading ? "Cargando…" : `Ver las ${total}`}
              </button>
            ) : total > 0 ? (
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{total}</span>
            ) : null}
          </div>
        )}
        pinned={pinned}
        emptyNote={
          own ? (
            <p className="text-[14px] leading-[1.5] text-text-2">
              Nadie más ha escrito todavía. Cuando lo hagan, aparecen aquí.
            </p>
          ) : null
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
        <KuraSheet onClose={() => setSheet(null)} label="Opciones de tu reseña" className="px-5">
          <h2 className="pb-2 pt-1 font-brand text-[22px] leading-[1.1] text-text">tu reseña</h2>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSheet("edit");
            }}
            className="flex min-h-[52px] w-full items-center text-left text-[16px] font-medium text-text transition-opacity active:opacity-60"
          >
            Editar
          </button>
          {/* Two-tap confirm — a dialog to delete 280 characters would be out
              of scale. No red: the words say what happens. */}
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="flex min-h-[52px] w-full items-center text-left text-[16px] font-medium text-text transition-opacity active:opacity-60 disabled:opacity-40"
          >
            {armed ? "Toca de nuevo para borrarla" : "Borrar reseña"}
          </button>
        </KuraSheet>
      )}
    </section>
  );
}
