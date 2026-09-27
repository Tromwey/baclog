"use client";

import { Fragment, useState } from "react";
import type { FollowListsVisibility } from "@/modules/social/follow-lists-policy";
import {
  deleteAccountAction,
  setFollowListsVisibilityAction,
  setNotifyRecapAction,
  setNotifyReleasesAction,
  setPublicAction,
} from "@/app/actions/account-actions";
import { Sheet, SheetClose } from "@/components/ui/sheet";
import { FIELD, GLASS_BUTTON, SOLID_BUTTON } from "@/components/kura/components";

/**
 * The live controls of Ajustes (Kura 30a / C3). The page itself is a server
 * component; only what writes lives here. Each switch applies AT ONCE (no
 * Guardar) and says so by moving — a failure snaps it back and says what
 * happened under the row.
 */

/**
 * The Kura switch (30a): 51×31; on = `--text` track with a `--bg` knob, off =
 * glass track with a `--text` knob. The knob slides with the system spring.
 */
export function KuraSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 disabled:opacity-50 ${
        checked ? "bg-text" : "bg-white/[0.16]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full shadow-[0_2px_6px_rgba(0,0,0,.35)] transition-[translate,background-color] duration-[260ms] [transition-timing-function:cubic-bezier(.2,.9,.3,1.25)] motion-reduce:transition-none ${
          checked ? "translate-x-5 bg-bg" : "translate-x-0 bg-text"
        }`}
      />
    </button>
  );
}

/** A 52 row with a title, an optional note, and the switch at the right. */
function SwitchRow({
  title,
  note,
  checked,
  onChange,
  error,
}: {
  title: string;
  note?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  error: string | null;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 py-2 pl-4 pr-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[16px] text-text">{title}</span>
        {(error ?? note) && (
          <span role={error ? "status" : undefined} className="text-[13px] leading-[1.4] text-text-2">
            {error ?? note}
          </span>
        )}
      </div>
      <KuraSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Optimistic boolean setting: flips now, reverts with a sentence on failure. */
function useSetting(initial: boolean, save: (v: boolean) => Promise<unknown>) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  async function set(next: boolean) {
    setValue(next);
    setError(null);
    try {
      await save(next);
    } catch {
      setValue(!next);
      setError("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    }
  }
  return [value, set, error] as const;
}

/**
 * Perfil privado — the product's one privacy switch (`users.isPublic`,
 * inverted). "Privado" is immediate: the public page 404s like one that never
 * existed and your activity leaves your people's feeds (setPublicAction busts
 * the public tree). The mock's "Apruebas a quien te sigue" (follow requests)
 * doesn't exist in the product, so the note says what private really does.
 */
export function PrivacySwitch({ initialIsPublic }: { initialIsPublic: boolean }) {
  const [isPublic, setIsPublic, error] = useSetting(initialIsPublic, setPublicAction);
  return (
    <SwitchRow
      title="Perfil privado"
      note={
        isPublic
          ? "Tu perfil es público y tu actividad sale en el feed de quien te sigue."
          : "Nadie más ve tu perfil y tu actividad no sale en ningún feed."
      }
      checked={!isPublic}
      onChange={(priv) => setIsPublic(!priv)}
      error={error}
    />
  );
}

const FOLLOW_LISTS_OPTIONS: { id: FollowListsVisibility; label: string }[] = [
  { id: "public", label: "Todos" },
  { id: "mutuals", label: "Seguidores mutuos" },
  { id: "private", label: "Solo yo" },
];

/**
 * "Quién ve tus seguidores y seguidos" (2026-09-27, `user.follow_lists_visibility`):
 * a title row and the three choices as 52 radio rows inside the privacidad
 * group — the 30b pattern (tap saves at once, the check marks the choice,
 * fill-change press state, no borders). The counts stay public whatever this
 * says, and the lists only exist while the profile is public — the note says
 * both. A failure puts the previous choice back and says so.
 */
export function FollowListsChoice({ initial }: { initial: FollowListsVisibility }) {
  const [value, setValue] = useState<FollowListsVisibility>(initial);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: FollowListsVisibility) {
    if (id === value) return;
    const prev = value;
    setValue(id);
    setError(null);
    try {
      const res = await setFollowListsVisibilityAction(id);
      if ("error" in res) throw new Error(res.error);
    } catch {
      setValue(prev);
      setError("No se pudo guardar. Revisa tu conexión y vuelve a intentar.");
    }
  }

  // Static on purpose: the Perfil privado switch above flips live, and a note
  // keyed on the server's isPublic would lie until the next load.
  const note =
    "Los números se ven en tu perfil. Esto decide quién ve las listas. Con el perfil privado, nadie más.";

  return (
    <>
      <div className="flex min-h-[52px] flex-col justify-center gap-[3px] py-2 pl-4 pr-3.5">
        <span className="text-[16px] text-text">Quién ve tus seguidores y seguidos</span>
        <span role={error ? "status" : undefined} className="text-[13px] leading-[1.4] text-text-2">
          {error ?? note}
        </span>
      </div>
      <div role="radiogroup" aria-label="Quién ve tus seguidores y seguidos" className="flex flex-col">
        {FOLLOW_LISTS_OPTIONS.map((o) => {
          const on = value === o.id;
          return (
            <Fragment key={o.id}>
              <span aria-hidden className="ml-4 h-px bg-white/[0.06]" />
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(o.id)}
                className="flex min-h-[52px] items-center gap-3 pl-8 pr-4 text-left transition-colors active:bg-white/[0.06]"
              >
                <span className={`flex-1 text-[16px] ${on ? "text-text" : "text-text-2"}`}>{o.label}</span>
                {on && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-text" aria-hidden>
                    <path d="M4.5 12.5l4.8 4.8L19.5 7" />
                  </svg>
                )}
              </button>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

/** F3.8 — the release email's opt-out (album pre-orders only, today). */
export function ReleasesSwitch({ initial }: { initial: boolean }) {
  const [on, setOn, error] = useSetting(initial, setNotifyReleasesAction);
  return (
    <SwitchRow
      title="Estrenos de no puedo esperar"
      note="Un correo el día que sale lo que guardaste antes de su estreno."
      checked={on}
      onChange={setOn}
      error={error}
    />
  );
}

/** Phase 4b — the monthly recap email's opt-out, same row as the releases one. */
export function RecapSwitch({ initial }: { initial: boolean }) {
  const [on, setOn, error] = useSetting(initial, setNotifyRecapAction);
  return (
    <SwitchRow
      title="Correo del recap mensual"
      note="Un correo el día 1 con lo que guardaste, completaste y reseñaste el mes anterior."
      checked={on}
      onChange={setOn}
      error={error}
    />
  );
}

/**
 * C3 Borrar cuenta — the one irreversible action of the account, and so the
 * one that is confirmed: a sheet that says what goes, asks you to type your
 * @ (or your email while you have no @), and the SOLID "Borrar cuenta".
 * No red anywhere (§color: lo destructivo se entiende por el título y la
 * confirmación).
 */
export function DeleteAccount({ confirmWord }: { confirmWord: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center text-[15px] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
      >
        Borrar cuenta
      </button>
      {open && <DeleteSheet confirmWord={confirmWord} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeleteSheet({ confirmWord, onClose }: { confirmWord: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === confirmWord.toLowerCase();

  async function confirm() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    try {
      // Redirects to /login on success; returning here means it didn't.
      await deleteAccountAction();
    } catch (err) {
      // A redirect surfaces as a thrown NEXT_REDIRECT — that's success.
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
      setBusy(false);
      setError("No se pudo borrar tu cuenta. Revisa tu conexión y vuelve a intentar.");
    }
  }

  return (
    <Sheet onClose={onClose} label="Borrar cuenta">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-brand text-[26px] leading-[1.1] text-text">¿borrar tu cuenta?</h2>
        <p className="mb-3 mt-1 text-[15px] leading-[1.5] text-text-2">
          Se borran tus colecciones, reseñas y seguidores. No se puede deshacer.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            escribe {confirmWord}
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`Escribe ${confirmWord} para confirmar`}
            className={FIELD}
          />
        </label>
        {error && (
          <p role="status" className="px-1 pt-1 text-[13px] leading-[1.4] text-text-2">
            {error}
          </p>
        )}
        <div className="mt-2.5 flex flex-col gap-2">
          <button type="button" onClick={confirm} disabled={!matches || busy} className={`${SOLID_BUTTON} w-full`}>
            {busy ? "Borrando…" : "Borrar cuenta"}
          </button>
          <SheetClose className={`${GLASS_BUTTON} h-[52px] w-full text-[16px]`}>Cancelar</SheetClose>
        </div>
      </div>
    </Sheet>
  );
}
