"use client";

import { useState } from "react";
import {
  chooseServiceAndFinishAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";

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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <h1 className="font-mono text-2xl font-bold tracking-[0.35em]">BACLOG</h1>

      {step === 1 ? (
        <form onSubmit={submitProfile} className="mt-10 w-full max-w-sm space-y-4">
          <div>
            <label className="block text-sm text-neutral-300" htmlFor="name">
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
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-300" htmlFor="birthYear">
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
              className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 outline-none focus:border-neutral-400"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Solo para verificar tu edad. Nunca se muestra.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy || !name || birthYear.length !== 4}
            className="w-full rounded-full bg-neutral-100 py-3.5 font-semibold text-neutral-900 disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Continuar"}
          </button>
          {error && (
            <p className="text-sm text-red-400">Revisa los datos e intenta de nuevo.</p>
          )}
        </form>
      ) : (
        <div className="mt-10 w-full max-w-sm space-y-3">
          <p className="text-sm text-neutral-300">
            ¿Dónde escuchas música? Cada álbum se abrirá ahí.
          </p>
          {SERVICES.map((s) => (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => pickService(s.id)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3.5 text-left font-medium hover:border-neutral-400 disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
          <p className="pt-1 text-xs text-neutral-500">
            Puedes cambiarlo cuando quieras en Ajustes.
          </p>
        </div>
      )}
    </main>
  );
}
