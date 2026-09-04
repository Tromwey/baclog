"use client";

import { useState } from "react";
import { chooseServiceAndFinishAction } from "@/app/actions/onboarding-actions";
import { PLAY_PATH } from "@/components/glyph-paths";
import { FillIcon } from "@/components/ui";
import { ONBOARDING_HEXES, OnboardingShell } from "./chrome";

/** The four services, in the mock's order (06f "Dónde escuchar"). */
const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "tidal", label: "TIDAL" },
] as const;

type ServiceId = (typeof SERVICES)[number]["id"];

/**
 * Step 3 · "¿Dónde escuchas?" (onboarding v2, 2026-09-03). The four services
 * as the mock's glass rows (06f: rounded-full glass, 26px circle with the
 * play glyph, name 14/600); tapping one saves it and finishes — the action
 * redirects server-side, so the row only re-enables if it returned (failed).
 * No skip: every album link needs a service, and the resolver's Spotify
 * default is a fallback, not a choice.
 */
export function ServiceStep() {
  const [busy, setBusy] = useState<ServiceId | null>(null);
  const [error, setError] = useState(false);

  async function pick(service: ServiceId) {
    if (busy) return;
    setBusy(service);
    setError(false);
    // Success is a server-side redirect (see chooseServiceAndFinishAction):
    // only a failure returns here, so only then re-enable the rows.
    const res = await chooseServiceAndFinishAction(service).finally(() =>
      setBusy(null),
    );
    if (res && "error" in res) setError(true);
  }

  return (
    <OnboardingShell
      step={3}
      glowHexes={ONBOARDING_HEXES}
      title="¿Dónde escuchas?"
      lede="Cada álbum se abrirá ahí. Lo cambias en Ajustes cuando quieras."
      footer={
        error ? (
          <p className="text-center text-sm text-hot">
            No se guardó. Toca de nuevo.
          </p>
        ) : null
      }
    >
      <div
        role="group"
        aria-label="Servicio de música"
        className="relative mt-8 flex flex-col gap-2 px-5"
      >
        {SERVICES.map((s) => {
          const isBusy = busy === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={busy !== null}
              onClick={() => pick(s.id)}
              className="flex items-center gap-3 rounded-full bg-[var(--glass-bg)] px-4 py-3 text-left transition-colors hover:bg-white/[0.12] active:bg-white/[0.14] disabled:opacity-60 disabled:hover:bg-[var(--glass-bg)]"
            >
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-white/10 text-text">
                <FillIcon d={PLAY_PATH} size={12} />
              </span>
              <span className="flex-1 text-[14px] font-semibold text-text">
                {s.label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
                {isBusy ? "Guardando…" : "Elegir"}
              </span>
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
