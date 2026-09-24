"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import { PicksStep } from "./picks-step";
import { UsernameStep } from "./username-step";

export type OnboardingStep = "usuario" | "picks";

/**
 * Kura onboarding, the mock's order (flujos-v2, flujo 01):
 *   O1b · elige tu usuario   (+ name and birth year — F2.1 / F2.2 / F2.17)
 *   32a · elige 3            (the first collection + the obsessions)
 *   32b · tu gente           → /onboarding/gente (a server page: it reads
 *                               the people who share the picks just saved)
 *   ··· · servicio preferido (the product's step the mock doesn't draw; last,
 *                               because its action saves AND finishes)
 *
 * The two first steps are client state on /onboarding; the hand-off to
 * /onboarding/gente is a client navigation to a URL the router has never
 * seen (no stale redirect to replay — the reason the finish itself stays a
 * server-side redirect inside chooseServiceAndFinishAction).
 */
export function OnboardingFlow({
  initialPool,
  initialNextPage,
  initialStep,
}: {
  initialPool: OnboardingPoolItem[];
  initialNextPage: number | null;
  initialStep: OnboardingStep;
}) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(initialStep);

  if (step === "usuario") {
    return <UsernameStep onDone={() => setStep("picks")} />;
  }

  return (
    <PicksStep
      initialPool={initialPool}
      initialNextPage={initialNextPage}
      onDone={() => router.replace("/onboarding/gente")}
    />
  );
}
