"use client";

import { useState } from "react";
import {
  chooseServiceAndFinishAction,
  claimUsernameAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";
import { AuthAuraBackdrop, Button } from "@/components/ui";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";

const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
] as const;

export default function OnboardingPage() {
  const nameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const birthYearRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const usernameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  // Step 2 is skippable BY DESIGN (Pilar 4: "privado por default, opt-in
  // explícito" — a wall here would make every account public without a
  // choice). It exists because the claim used to live only in Ajustes, so
  // username stayed null for everyone and every share card exported with no
  // link (card-exporter drops `text` when publicUrl is null).
  async function submitUsername(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUsernameError(null);
    const res = await claimUsernameAction(username);
    setBusy(false);
    if (!("username" in res)) {
      setUsernameError(
        res.error === "taken"
          ? "Ese username ya existe."
          : "Username inválido (3-30: a-z, 0-9, _ .)",
      );
      return;
    }
    setStep(3);
  }

  async function pickService(service: (typeof SERVICES)[number]["id"]) {
    setBusy(true);
    // Redirects server-side; only re-enable if the action returns (error)
    await chooseServiceAndFinishAction(service).finally(() => setBusy(false));
  }

  return (
    <main className="relative flex min-h-lvh flex-col items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <AuthAuraBackdrop seed={47} />
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
                ref={nameRef}
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
                ref={birthYearRef}
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
        ) : step === 2 ? (
          <form onSubmit={submitUsername} className="mt-10 w-full space-y-4">
            <div>
              <label className="block text-sm text-text-2" htmlFor="username">
                Reclama tu página
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
            <Button
              type="submit"
              disabled={busy || username.length < 3}
              className="w-full"
            >
              {busy ? "Reclamando…" : "Reclamar"}
            </Button>
            {usernameError && <p className="text-sm text-hot">{usernameError}</p>}
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={busy}
              className="w-full py-1 text-sm text-text-3 underline disabled:opacity-40"
            >
              Ahora no
            </button>
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
