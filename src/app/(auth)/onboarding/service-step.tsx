"use client";

import { unstable_rethrow } from "next/navigation";
import { useState } from "react";
import { chooseServiceAndFinishAction } from "@/app/actions/onboarding-actions";
import { BACK_PATH } from "@/components/glyph-paths";
import { CHIP_44 } from "@/components/kura/components";
import {
  FailLine,
  FlowCta,
  RADIO_CHECK_PATH,
  SEED_STEPS,
  StepMark,
  Stroke,
} from "./chrome";

/** The four services, in 30b's order ("abrir música en"). */
const SERVICES = [
  { id: "apple_music", label: "Apple Music" },
  { id: "spotify", label: "Spotify" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "tidal", label: "Tidal" },
] as const;

type ServiceId = (typeof SERVICES)[number]["id"];

/**
 * The last onboarding step — the product's, not the mock's: flujo 01 ends at
 * "tu gente", but every album link needs a service, so the choice is kept
 * and drawn like 30b "abrir música en" (Ajustes): a `--s1` group, rows of
 * 52, one check on the chosen one, no preselection. The CTA is where the
 * flow truly ends, so it carries the mock's closing line: "Entrar a kura"
 * (· sigues a N).
 *
 * chooseServiceAndFinishAction saves AND redirects server-side (a client
 * push here can replay the stale "/backlogs → /onboarding" redirect), so
 * only a failure ever returns to this screen.
 */
export function ServiceStep({
  followCount,
  onBack,
}: {
  followCount: number;
  onBack: () => void;
}) {
  const [choice, setChoice] = useState<ServiceId | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function finish() {
    if (!choice || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await chooseServiceAndFinishAction(choice);
      // Success never gets here (the action redirects).
      if (res && "error" in res) setFailed(true);
    } catch (err) {
      // A redirect signal is Next's, not a failure: let it through.
      unstable_rethrow(err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-4 pb-[calc(34px+env(safe-area-inset-bottom))] text-text">
      <header className="flex items-center justify-between px-2 pt-[calc(64px+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a tu gente"
          className={CHIP_44}
        >
          <Stroke d={BACK_PATH} />
        </button>
        <StepMark n={3} of={SEED_STEPS} />
      </header>

      <div className="mt-4 flex flex-col gap-7">
        <div className="flex flex-col gap-4 px-2">
          <h1 className="font-brand text-[32px] font-normal leading-[1.08] text-text text-balance">
            elige dónde escuchas.
          </h1>
          <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
            Cada álbum se abre en esta app. La cambias cuando quieras en Ajustes.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Abrir música en"
          className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1"
        >
          {SERVICES.map((s, i) => {
            const sel = choice === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={busy}
                onClick={() => {
                  setFailed(false);
                  setChoice(s.id);
                }}
                className="flex min-h-[52px] items-center gap-3 px-4 text-left font-sans text-text transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                style={
                  i > 0
                    ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)" }
                    : undefined
                }
              >
                <span className="flex-1 text-[16px]">{s.label}</span>
                <Stroke
                  d={RADIO_CHECK_PATH}
                  width={2.4}
                  className={`transition-opacity duration-[160ms] ${sel ? "opacity-100" : "opacity-0"}`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        {failed && <FailLine>No se guardó. Toca Entrar de nuevo.</FailLine>}
        <FlowCta ready={choice !== null} busy={busy} onClick={finish}>
          {busy
            ? "Entrando…"
            : choice === null
              ? "Elige una"
              : followCount > 0
                ? `Entrar a kura · sigues a ${followCount}`
                : "Entrar a kura"}
        </FlowCta>
      </div>
    </main>
  );
}
