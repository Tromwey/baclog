"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  claimUsernameAction,
  updateDisplayNameAction,
} from "@/app/actions/account-actions";
import { CHIP_44 } from "@/components/kura/components";
import { AvatarPicker } from "../avatar-picker";

/**
 * The form of 20f. "Guardar" (glass, top right) writes the name and — only
 * while you have none — claims the @usuario, then goes back to Ajustes;
 * "Cancelar" (× chip) leaves without writing. The photo saves on its own
 * (AvatarPicker), it is not part of Guardar.
 *
 * A claimed @usuario is read-only here, as it was in the old Ajustes: it is
 * the path of your public page and of every link already shared, and
 * claiming re-opens the page (claimUsernameAction sets isPublic) — changing
 * it needs its own decision, not a text field.
 */
export function EditProfile({
  tint,
  hexes,
  initialName,
  initialUsername,
  initialAvatarUrl,
}: {
  tint: string;
  hexes: string[];
  initialName: string;
  initialUsername: string | null;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const nameChanged = name.trim() !== initialName.trim();
  const claiming = !initialUsername && username.length > 0;
  const canSave =
    !busy && name.trim().length > 0 && (nameChanged || claiming) && (!claiming || username.length >= 3);

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setNameError(null);
    setUserError(null);
    try {
      if (nameChanged) {
        const res = await updateDisplayNameAction(name);
        if ("error" in res) {
          setNameError("El nombre va de 1 a 50 caracteres.");
          setBusy(false);
          return;
        }
      }
      if (claiming) {
        const res = await claimUsernameAction(username);
        if (!("username" in res)) {
          setUserError(
            res.error === "taken"
              ? "Ese @usuario ya existe. Prueba con otro."
              : "De 3 a 30: minúsculas, números, _ y punto.",
          );
          setBusy(false);
          return;
        }
      }
      router.push("/settings");
      router.refresh();
    } catch {
      setBusy(false);
      setNameError("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    }
  }

  return (
    <>
      <div
        className="flex flex-col items-center gap-3.5 px-5 pb-[30px] pt-[calc(16px+env(safe-area-inset-top))]"
        style={{ background: tint }}
      >
        <div className="mx-1 flex items-center justify-between self-stretch">
          <Link href="/settings" aria-label="Cancelar" className={CHIP_44}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex h-11 items-center rounded-full bg-[var(--glass-bg)] px-[18px] text-[15px] font-semibold text-text bl-press hover:bg-white/[0.12] disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
        <AvatarPicker initialUrl={initialAvatarUrl} hexes={hexes} name={name || initialUsername || "·"} />
      </div>

      <div className="flex flex-col gap-2 px-3 pt-2">
        <div className="flex flex-col overflow-hidden rounded-[var(--r-surface)] bg-surface-1">
          <label className="flex min-h-14 items-center gap-3.5 px-4">
            <span className="w-[92px] flex-none text-[15px] text-text-2">Nombre</span>
            <input
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-text outline-none placeholder:text-text-3"
              placeholder="Tu nombre"
            />
          </label>
          <span aria-hidden className="mx-4 h-px bg-white/[0.06]" />
          {initialUsername ? (
            <div className="flex min-h-14 items-center gap-3.5 px-4">
              <span className="w-[92px] flex-none text-[15px] text-text-2">Usuario</span>
              <span className="min-w-0 flex-1 truncate text-[16px] text-text">@{initialUsername}</span>
            </div>
          ) : (
            <label className="flex min-h-14 items-center gap-3.5 px-4">
              <span className="w-[92px] flex-none text-[15px] text-text-2">Usuario</span>
              <span className="text-[16px] text-text-2">@</span>
              <input
                value={username}
                maxLength={30}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tunombre"
                className="-ml-2.5 min-w-0 flex-1 bg-transparent py-3 font-mono text-[16px] text-text outline-none placeholder:text-text-3"
              />
            </label>
          )}
        </div>
        <p role={nameError || userError ? "status" : undefined} className="px-3 text-[13px] leading-[1.45] text-pretty text-text-2">
          {nameError ??
            userError ??
            (initialUsername
              ? "Tu @usuario es el link de tu página: no cambia, para que los links que ya compartiste sigan funcionando."
              : "Con un @usuario tu página se vuelve pública. Puedes hacerla privada en Ajustes.")}
        </p>
      </div>
    </>
  );
}
