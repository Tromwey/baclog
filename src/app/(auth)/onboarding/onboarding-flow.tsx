"use client";

import { useState } from "react";
import {
  claimUsernameAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";
import { Button } from "@/components/ui";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import {
  CTA_CLASS,
  INPUT_CLASS,
  ONBOARDING_HEXES,
  OnboardingShell,
  type OnboardingStep,
} from "./chrome";
import { PicksStep } from "./picks-step";
import { ServiceStep } from "./service-step";

/**
 * Onboarding, three steps (v2 — founder decisions 2026-09-03):
 *   1 · name + birth year + username, ONE form (F2.1 / F2.2 minor gate /
 *       F2.17 claim; the username is optional — Ajustes can claim it later)
 *   2 · Elige tres          (the mock; the first backlog + obsessions)
 *   3 · servicio preferido  (restored as the last step; saves and finishes)
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
  const nameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const birthYearRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const usernameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Name + year first (the under-13 gate redirects to /blocked from inside
  // the action and never returns), then the claim if a handle was typed. A
  // taken/invalid handle keeps the user HERE with the error under the field;
  // the name is already saved, and completeOnboardingAction is a plain
  // UPDATE, so re-submitting just writes it again.
  //
  // The claim stays skippable BY DESIGN (Pilar 4: "privado por default,
  // opt-in explícito" — a wall here would make every account public without
  // a choice). It lives in onboarding because when it lived only in Ajustes
  // username stayed null for everyone and every share card exported with no
  // link (card-exporter drops `text` when publicUrl is null).
  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    setUsernameError(null);
    try {
      const res = await completeOnboardingAction({
        name,
        birthYear: Number(birthYear),
      });
      if (res?.error) {
        setError(true);
        return;
      }
      if (username.length > 0) {
        const claim = await claimUsernameAction(username, { refresh: false });
        if (!("username" in claim)) {
          setUsernameError(
            claim.error === "taken"
              ? "Ese username ya existe."
              : "Username inválido (3-30: a-z, 0-9, _ .)",
          );
          return;
        }
      }
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  if (step === 2) {
    return (
      <PicksStep
        initialPool={initialPool}
        initialNextPage={initialNextPage}
        onDone={() => setStep(3)}
      />
    );
  }

  if (step === 3) {
    return <ServiceStep />;
  }

  const usernameShort = username.length > 0 && username.length < 3;

  return (
    <OnboardingShell
      step={1}
      glowHexes={ONBOARDING_HEXES}
      title="¿Cómo te llamamos?"
      lede="Tu nombre visible, tu año de nacimiento y tu página."
      footer={
        <>
          {error && (
            <p className="text-center text-sm text-hot">
              Revisa los datos e intenta de nuevo.
            </p>
          )}
          <Button
            type="submit"
            form="onboarding-profile"
            disabled={busy || !name || birthYear.length !== 4 || usernameShort}
            className={CTA_CLASS}
          >
            {busy ? "Guardando…" : "Continuar"}
          </Button>
        </>
      }
    >
      <form
        id="onboarding-profile"
        onSubmit={submitProfile}
        className="relative mt-8 w-full space-y-4 px-6"
      >
        <div>
          <label className="sr-only" htmlFor="name">
            Nombre
          </label>
          <input
            id="name"
            ref={nameRef}
            required
            maxLength={50}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre visible"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm text-text-2" htmlFor="birthYear">
            Año de nacimiento
          </label>
          <input
            id="birthYear"
            ref={birthYearRef}
            required
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))}
            placeholder="2004"
            className={`mt-2 ${INPUT_CLASS}`}
          />
          <p className="mt-1 text-xs text-text-3">
            Solo para verificar tu edad. Nunca se muestra.
          </p>
        </div>
        <div>
          <label className="block text-sm text-text-2" htmlFor="username">
            Tu página
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 font-mono text-sm text-text-3">
              baclog.app/
            </span>
            <input
              id="username"
              ref={usernameRef}
              value={username}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={usernameError !== null || usernameShort}
              aria-describedby="username-help"
              onChange={(e) => {
                setUsernameError(null);
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
                );
              }}
              placeholder="tunombre"
              className={`min-w-0 flex-1 font-mono ${INPUT_CLASS}`}
            />
          </div>
          {usernameError ? (
            <p id="username-help" className="mt-2 text-xs text-hot">
              {usernameError}
            </p>
          ) : (
            <p id="username-help" className="mt-2 text-xs text-text-3">
              Opcional: puedes reclamarlo después en Ajustes. Es a donde llega
              todo lo que compartas; tu nombre y tus backlogs quedan visibles
              ahí, y lo apagas cuando quieras.
            </p>
          )}
        </div>
      </form>
    </OnboardingShell>
  );
}
