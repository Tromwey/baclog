"use client";

import { useState } from "react";
import Link from "next/link";
import {
  claimUsernameAction,
  deleteAccountAction,
  setNotifyReleasesAction,
  setPreferredServiceAction,
  setPublicAction,
  updateDisplayNameAction,
} from "@/app/actions/account-actions";
import { AvatarPicker } from "./avatar-picker";

const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
  { id: "tidal", label: "TIDAL" },
] as const;

type ServiceId = (typeof SERVICES)[number]["id"];

export function SettingsForm({
  initialName,
  initialAvatarUrl,
  avatarHexes,
  initialService,
  email,
  initialUsername,
  initialIsPublic,
  initialNotifyReleases,
}: {
  initialName: string;
  /** F3.11 — current photo URL, null for the orb. */
  initialAvatarUrl: string | null;
  /** The viewer's ADN pair the picker's orb falls back to. */
  avatarHexes: [string, string];
  initialService: ServiceId | null;
  email: string;
  initialUsername: string | null;
  initialIsPublic: boolean;
  initialNotifyReleases: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [service, setService] = useState<ServiceId | null>(initialService);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState(initialUsername ?? "");
  const [claimed, setClaimed] = useState<string | null>(initialUsername);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [notifyReleases, setNotifyReleases] = useState(initialNotifyReleases);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUsernameError(null);
    const res = await claimUsernameAction(username);
    setBusy(false);
    const claimedName = "username" in res ? res.username : null;
    if (claimedName) {
      setClaimed(claimedName);
      setIsPublic(true);
    } else {
      setUsernameError(
        res.error === "taken" ? "Ese username ya existe." : "Username inválido (3-30: a-z, 0-9, _ .)",
      );
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await updateDisplayNameAction(name);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function pickService(id: ServiceId) {
    setService(id);
    await setPreferredServiceAction(id);
  }

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-text-2">Cuenta</h2>
        <p className="mt-1 text-sm text-text-3">{email}</p>
        <AvatarPicker initialUrl={initialAvatarUrl} hexes={avatarHexes} />
        <form onSubmit={saveName} className="mt-3 flex gap-2">
          <input
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl bg-surface-2 px-4 py-2.5 outline-none transition-colors focus:bg-surface-3"
            aria-label="Nombre visible"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-xl bg-accent px-4 font-medium text-bg disabled:opacity-40"
          >
            {saved ? "✓" : "Guardar"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-2">
          Tu app de música
        </h2>
        <div className="mt-3 space-y-2">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => pickService(s.id)}
              className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
                service === s.id
                  ? "bg-accent-soft font-semibold text-accent"
                  : "bg-surface-2 hover:bg-surface-3"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-2">Avisos</h2>
        <label className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-sm">Avísame el día que sale un álbum</span>
          <input
            type="checkbox"
            checked={notifyReleases}
            onChange={async (e) => {
              const next = e.target.checked;
              setNotifyReleases(next);
              await setNotifyReleasesAction(next);
            }}
            className="h-5 w-5 accent-accent"
          />
        </label>
        <p className="mt-2 text-xs text-text-3">
          Un correo, una sola vez, cuando un álbum en preventa que guardaste
          por fin existe. Apágalo y el álbum se queda en tu backlog igual.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-text-2">
          Página pública
        </h2>
        {claimed ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm">
              <span className="text-text-2">Tu página: </span>
              <a
                href={`/u/${claimed}`}
                className="font-mono underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                baclog.app/{claimed}
              </a>
            </p>
            <label className="flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
              <span className="text-sm">Perfil visible públicamente</span>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={async (e) => {
                  const next = e.target.checked;
                  setIsPublic(next);
                  await setPublicAction(next);
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>
            <p className="text-xs text-text-3">
              Privado por default: solo lo que actives aquí se puede ver.
            </p>
          </div>
        ) : (
          <form onSubmit={claim} className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-3">baclog.app/</span>
              <input
                value={username}
                maxLength={30}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))
                }
                placeholder="tunombre"
                className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2.5 font-mono outline-none transition-colors focus:bg-surface-3"
                aria-label="Username"
              />
              <button
                type="submit"
                disabled={busy || username.length < 3}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                Reclamar
              </button>
            </div>
            {usernameError && (
              <p className="text-xs text-red-400">{usernameError}</p>
            )}
            <p className="text-xs text-text-3">
              Opt-in explícito: sin username, nada tuyo es público.
            </p>
          </form>
        )}
      </section>

      <section className="border-t border-line pt-6">
        <h2 className="text-sm font-semibold text-text-2">Legal</h2>
        <Link href="/creditos" className="mt-3 inline-block text-sm underline">
          Créditos
        </Link>
      </section>

      <section className="border-t border-line pt-6">
        <h2 className="text-sm font-semibold text-red-400">Zona peligrosa</h2>
        {confirmingDelete ? (
          <div className="mt-3 space-y-2 rounded-xl bg-red-950/60 p-4">
            <p className="text-sm text-text">
              Esto borra tu cuenta y todos tus backlogs. No hay vuelta atrás.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setBusy(true);
                  await deleteAccountAction();
                }}
                disabled={busy}
                className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Borrando…" : "Borrar todo"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-xl bg-surface-2 px-4 py-2 transition-colors hover:bg-surface-3"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="mt-3 text-sm text-red-400 underline"
          >
            Borrar mi cuenta
          </button>
        )}
      </section>
    </div>
  );
}
