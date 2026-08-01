"use client";

import { useState } from "react";
import { useItemReaction } from "./reaction-state";

/**
 * Step 3 of the welcome onboarding, on the surface where the reaction actually
 * happens.
 *
 * Two moments, never both:
 *
 * 1. BEFORE reacting — a coach mark that says where the second gesture lives.
 *    "Me obsesiona" is right above it, but "me gusta" hides in the ⋯ menu, and
 *    "no me gusta" doesn't unlock anything. Naming all three prevents the
 *    dead-end where a user marks "no me gusta" and wonders why nothing lit up.
 *
 * 2. AFTER reacting — the confirmation. Whether the step is DONE depends on
 *    which reaction they picked, so this is also where "no me gusta" gets told
 *    the truth without being scolded for it.
 *
 * "Just reacted" is derived by comparing live context state against the values
 * captured on mount — a session fact, not a persisted one, so it needs no
 * storage and never re-appears on a later visit.
 *
 * BOTH inputs are frozen at mount, and the component renders unconditionally
 * (the caller must NOT gate it on the step). Reacting revalidates the page, so
 * a server-side gate on "nothing loved yet" flips to false the instant the user
 * succeeds — unmounting this component and destroying the confirmation before
 * it can be seen. Freezing `stepPending` keeps the moment alive through that
 * re-render, and keeps it from ever appearing for someone who arrived already
 * activated.
 */
export function ReactionCoach({ stepPending }: { stepPending: boolean }) {
  const { verdict, obsessed } = useItemReaction();
  // Captured once, on mount: the server-rendered starting point. State (not a
  // ref) because this IS render input — a lazy initializer is the supported way
  // to freeze a first-render value and read it during render.
  const [initial] = useState({ verdict, obsessed, stepPending });

  // Arrived already activated → this surface says nothing, ever.
  if (!initial.stepPending) return null;

  const changed =
    verdict !== initial.verdict || obsessed !== initial.obsessed;

  if (!changed) {
    return (
      <div className="bl-rise relative mt-4 px-5">
        <div className="h-px bg-line" />
        <div className="mt-3.5 flex gap-2.5 font-mono text-[9px] uppercase tracking-[0.16em]">
          <span className="flex-none text-text-2">Paso 3</span>
          <span className="leading-[1.7] text-text-3">
            «Me gusta» está en el menú de opciones · «no me gusta» no cuenta
          </span>
        </div>
      </div>
    );
  }

  // Only obsession and "me gusta" seed the engine (LOVED_FILTER). A cleared
  // reaction leaves the step pending too — same honest wording.
  const unlocked = obsessed || verdict === "liked";

  return (
    <div className="bl-rise relative mx-5 mt-4 rounded-[var(--r-md)] bg-surface-1 px-[18px] py-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-3">
        {unlocked ? "Paso 3 · listo" : "Paso 3 · sigue pendiente"}
      </p>
      <p className="mt-2 font-serif text-[20px] italic leading-[1.2]">
        {unlocked
          ? "Ya sabemos qué amas — Recomiéndame está encendido."
          : "Anotado. Pero «no me gusta» no destila nada — el motor solo aprende de lo que amas."}
      </p>
    </div>
  );
}
