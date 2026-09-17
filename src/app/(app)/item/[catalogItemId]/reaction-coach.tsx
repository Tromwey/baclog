"use client";

import { useState } from "react";
import { CoachNote } from "@/components/ui";
import { useItemReaction } from "./reaction-state";

/**
 * First-run moment 3 (first-run.ts), on the surface where the reaction
 * actually happens. Two moments, never both:
 *
 * 1. BEFORE reacting — what the row does: "Me gustó" and "Obsesión" feed
 *    Discover, "Completo" opens the Completar sheet (where the review and
 *    "no me gustó" live).
 * 2. AFTER reacting — the confirmation. Whether Discover learned anything
 *    depends on WHICH reaction, so this is also where a completion with
 *    "no me gustó" gets told the truth without being scolded for it.
 *
 * "Just reacted" is derived by comparing live context state against the
 * values captured on mount — a session fact, not a persisted one.
 *
 * Both inputs are frozen at mount, and the component renders unconditionally
 * (the caller must NOT gate it on `pending`). Reacting revalidates the page,
 * so a server-side gate on "nothing judged yet" flips to false the instant
 * the user succeeds — unmounting this and destroying the confirmation before
 * it can be seen. Freezing `pending` keeps the moment alive through that
 * re-render, and keeps it from ever appearing for someone who arrived
 * already past it.
 */
export function ReactionCoach({ pending }: { pending: boolean }) {
  const { verdict, obsessed, completed } = useItemReaction();
  // Captured once, on mount: the server-rendered starting point. State (not
  // a ref) because this IS render input — a lazy initializer is the supported
  // way to freeze a first-render value and read it during render.
  const [initial] = useState({ verdict, obsessed, completed, pending });

  // Arrived already past it → this surface says nothing, ever.
  if (!initial.pending) return null;

  const changed =
    verdict !== initial.verdict ||
    obsessed !== initial.obsessed ||
    completed !== initial.completed;

  if (!changed) {
    return (
      <CoachNote className="-mt-1.5">
        Me gustó y Obsesión encienden Descubrir · Completo abre tu reseña.
      </CoachNote>
    );
  }

  // Only obsession and "me gustó" seed the engine (LOVED_FILTER).
  const unlocked = obsessed || verdict === "liked";
  return (
    <CoachNote label={unlocked ? "Listo" : "Anotado"} className="-mt-1.5">
      {unlocked
        ? "Eso ya alimenta tus recomendaciones en Descubrir."
        : "Descubrir aprende solo de lo que te gusta y te obsesiona."}
    </CoachNote>
  );
}
