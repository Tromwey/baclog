"use client";

import { useState } from "react";
import {
  claimUsernameAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";
import { finishOnboardingAction } from "@/app/actions/onboarding-actions";
import { Button } from "@/components/ui";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import type { OnboardingPoolItem } from "@/modules/backlog/onboarding-pool";
import {
  CTA_CLASS,
  GhostButton,
  ONBOARDING_HEXES,
  OnboardingShell,
  type OnboardingStep,
} from "./chrome";
import { PicksStep } from "./picks-step";

/**
 * Onboarding, three steps (Revamp UI, 2026-09-03):
 *   1 · name + birth year   (F2.1 / F2.2 minor gate — unchanged)
 *   2 · Elige tres          (new — the mock; the first backlog + obsessions)
 *   3 · username            (F2.17 — skippable, then finish)
 * The preferred music service left onboarding: it stays editable in Ajustes
 * and the link resolver defaults to Spotify when unset.
 */
export function OnboardingFlow({
  pool,
  initialStep,
}: {
  pool: OnboardingPoolItem[];
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

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await completeOnboardingAction({
      name,
      birthYear: Number(birthYear),
    });
    setBusy(false);
    // Under-13 never reaches here: the action redirects to /blocked
    if (res?.error) {
      setError(true);
      return;
    }
    setStep(2);
  }

  // The finish is a server-side redirect (see finishOnboardingAction); only
  // re-enable the buttons if the action returns, i.e. it failed.
  async function finish() {
    setBusy(true);
    await finishOnboardingAction().finally(() => setBusy(false));
  }

  // Step 3 is skippable BY DESIGN (Pilar 4: "privado por default, opt-in
  // explícito" — a wall here would make every account public without a
  // choice). It exists because the claim used to live only in Ajustes, so
  // username stayed null for everyone and every share card exported with no
  // link (card-exporter drops `text` when publicUrl is null).
  async function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUsernameError(null);
    const res = await claimUsernameAction(username);
    if (!("username" in res)) {
      setBusy(false);
      setUsernameError(
        res.error === "taken"
          ? "Ese username ya existe."
          : "Username inválido (3-30: a-z, 0-9, _ .)",
      );
      return;
    }
    await finishOnboardingAction().finally(() => setBusy(false));
  }

  const inputClass =
    "w-full rounded-[var(--r-md)] bg-surface-2 px-4 py-3 text-text outline-none transition-colors placeholder:text-text-3 focus:bg-surface-3";

  if (step === 2) {
    return <PicksStep pool={pool} onDone={() => setStep(3)} />;
  }

  if (step === 1) {
    return (
      <OnboardingShell
        step={1}
        glowHexes={ONBOARDING_HEXES}
        title="¿Cómo te llamamos?"
        lede="Tu nombre visible y tu año de nacimiento."
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
              disabled={busy || !name || birthYear.length !== 4}
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
              className={inputClass}
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
              className={`mt-2 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-text-3">
              Solo para verificar tu edad. Nunca se muestra.
            </p>
          </div>
        </form>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={3}
      glowHexes={ONBOARDING_HEXES}
      title="Reclama tu página."
      lede="Un link para todo lo que compartas."
      footer={
        <>
          {usernameError && (
            <p className="text-center text-sm text-hot">{usernameError}</p>
          )}
          <Button
            type="submit"
            form="onboarding-username"
            disabled={busy || username.length < 3}
            className={CTA_CLASS}
          >
            {busy ? "Reclamando…" : "Reclamar"}
          </Button>
          <GhostButton onClick={finish} disabled={busy}>
            Ahora no
          </GhostButton>
        </>
      }
    >
      <form
        id="onboarding-username"
        onSubmit={submitUsername}
        className="relative mt-8 w-full space-y-4 px-6"
      >
        <div>
          <label className="sr-only" htmlFor="username">
            Username
          </label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-sm text-text-3">
              baclog.app/
            </span>
            <input
              id="username"
              ref={usernameRef}
              value={username}
              maxLength={30}
              autoFocus
              onChange={(e) =>
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
                )
              }
              placeholder="tunombre"
              className="min-w-0 flex-1 rounded-[var(--r-md)] bg-surface-2 px-4 py-3 font-mono text-text outline-none transition-colors placeholder:text-text-3 focus:bg-surface-3"
            />
          </div>
          <p className="mt-2 text-xs text-text-3">
            Es a donde llega todo lo que compartas. Tu nombre y tus backlogs
            quedan visibles ahí; puedes apagarlo en Ajustes cuando quieras.
          </p>
        </div>
      </form>
    </OnboardingShell>
  );
}
