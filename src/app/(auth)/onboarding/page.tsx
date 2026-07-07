"use client";

import { useState } from "react";
import {
  chooseServiceAndFinishAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";
import { AuraBackdrop, Button } from "@/components/ui";

const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
] as const;

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
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

  async function pickService(service: (typeof SERVICES)[number]["id"]) {
    setBusy(true);
    // Redirects server-side; only re-enable if the action returns (error)
    await chooseServiceAndFinishAction(service).finally(() => setBusy(false));
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <AuraBackdrop height="45%" />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <h1 className="font-mono text-xl font-bold uppercase tracking-[0.35em] text-accent">
          Baclog
        </h1>

        {step === 1 ? (
          <form onSubmit={submitProfile} className="mt-10 w-full space-y-4">
            <div>
              <label className="block text-sm text-text-2" htmlFor="name">
                ¿Cómo te llamamos?
              </label>
              <input
                id="name"
                required
                maxLength={50}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre visible"
                className="mt-2 w-full rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 text-text outline-none transition-colors placeholder:text-text-3 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-2" htmlFor="birthYear">
                Año de nacimiento
              </label>
              <input
                id="birthYear"
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))}
                placeholder="2004"
                className="mt-2 w-full rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 text-text outline-none transition-colors placeholder:text-text-3 focus:border-accent"
              />
              <p className="mt-1 text-xs text-text-3">
                Solo para verificar tu edad. Nunca se muestra.
              </p>
            </div>
            <Button
              type="submit"
              disabled={busy || !name || birthYear.length !== 4}
              className="w-full"
            >
              {busy ? "Guardando…" : "Continuar"}
            </Button>
            {error && (
              <p className="text-sm text-hot">
                Revisa los datos e intenta de nuevo.
              </p>
            )}
          </form>
        ) : (
          <div className="mt-10 w-full space-y-3">
            <p className="text-sm text-text-2">
              ¿Dónde escuchas música? Cada álbum se abrirá ahí.
            </p>
            {SERVICES.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => pickService(s.id)}
                className="w-full rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3.5 text-left font-medium text-text transition-colors hover:border-accent disabled:opacity-40"
              >
                {s.label}
              </button>
            ))}
            <p className="pt-1 text-xs text-text-3">
              Puedes cambiarlo cuando quieras en Ajustes.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
