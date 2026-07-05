"use client";

import { useState } from "react";
import {
  deleteAccountAction,
  setPreferredServiceAction,
  updateDisplayNameAction,
} from "@/app/actions/account-actions";

const SERVICES = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube_music", label: "YouTube Music" },
] as const;

type ServiceId = (typeof SERVICES)[number]["id"];

export function SettingsForm({
  initialName,
  initialService,
  email,
}: {
  initialName: string;
  initialService: ServiceId | null;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [service, setService] = useState<ServiceId | null>(initialService);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

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
        <h2 className="text-sm font-semibold text-neutral-400">Cuenta</h2>
        <p className="mt-1 text-sm text-neutral-500">{email}</p>
        <form onSubmit={saveName} className="mt-3 flex gap-2">
          <input
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 outline-none focus:border-neutral-400"
            aria-label="Nombre visible"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-xl bg-neutral-100 px-4 font-medium text-neutral-900 disabled:opacity-40"
          >
            {saved ? "✓" : "Guardar"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-400">
          Tu app de música
        </h2>
        <div className="mt-3 space-y-2">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => pickService(s.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left ${
                service === s.id
                  ? "border-neutral-100 bg-neutral-800 font-semibold"
                  : "border-neutral-700 bg-neutral-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-800 pt-6">
        <h2 className="text-sm font-semibold text-red-400">Zona peligrosa</h2>
        {confirmingDelete ? (
          <div className="mt-3 space-y-2 rounded-xl border border-red-900 bg-red-950/40 p-4">
            <p className="text-sm text-neutral-200">
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
                className="rounded-xl border border-neutral-700 px-4 py-2"
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
