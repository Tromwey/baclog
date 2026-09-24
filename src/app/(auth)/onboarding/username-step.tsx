"use client";

import { useEffect, useState } from "react";
import {
  checkUsernameAction,
  claimUsernameAction,
  completeOnboardingAction,
  signOutAction,
} from "@/app/actions/account-actions";
import { BACK_PATH } from "@/components/glyph-paths";
import { CHIP_44, FIELD, Glyph } from "@/components/kura/components";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import { FailLine, FlowCta, Stroke } from "./chrome";

type HandleState = "idle" | "free" | "taken" | "invalid";

/**
 * Kura · O1b "elige tu usuario." — the second half of creating the account
 * (the email was the first, so the mark reads "2 de 2"). Volver at 64/24,
 * the title at 170, glass fields (radius 16, 52 tall), the solid "Crear
 * cuenta" at the foot.
 *
 * What the product keeps and the mock doesn't draw:
 *  - the birth year (F2.2: under 13 is turned away inside the action, which
 *    redirects to /blocked and never returns). A third field, same glass.
 *  - the handle is OPTIONAL (Pilar 4, "privado por default"): claiming one
 *    makes the profile public, so an empty field is a valid, private choice.
 *    Why it lives here at all: when it lived only in Ajustes nobody claimed
 *    one and every shared card went out without a link.
 *
 * "libre" (the mock's live check) comes from checkUsernameAction, the
 * read-only twin of the claim, debounced 400 ms after the last keystroke;
 * the claim itself still runs on "Crear cuenta" and is what settles a race.
 *
 * Volver: the account already exists (the email code signed it in), so the
 * way back to the email is signing out — /login is where that lands.
 */
export function UsernameStep({ onDone }: { onDone: () => void }) {
  const usernameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const nameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const yearRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleShort = username.length > 0 && username.length < 3;

  // The live "libre / ocupado" beside the field — a read, never a write.
  useEffect(() => {
    if (username.length < 3) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const res = await checkUsernameAction(username);
        if (live) setHandleState(res.status);
      } catch {
        // Silence: the claim on submit is the answer that matters.
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [username]);
  const ready = name.trim().length > 0 && birthYear.length === 4 && !handleShort;

  // Name + year first, then the claim if a handle was typed. A taken or
  // invalid handle keeps the user HERE; the name is already saved and
  // completeOnboardingAction is a plain UPDATE, so re-submitting just writes
  // it again. `refresh: false` — see claimUsernameAction: a revalidate here
  // re-requests the login chain's URL and yanks the user out of the flow.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setFailed(false);
    setHandleState("idle");
    try {
      const res = await completeOnboardingAction({
        name,
        birthYear: Number(birthYear),
      });
      if (res?.error) {
        setFailed(true);
        return;
      }
      if (username.length > 0) {
        const claim = await claimUsernameAction(username, { refresh: false });
        if (!("username" in claim)) {
          setHandleState(claim.error === "taken" ? "taken" : "invalid");
          usernameRef.current?.focus();
          return;
        }
      }
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const answer =
    handleState === "taken"
      ? "ocupado"
      : handleState === "invalid"
        ? "no válido"
        : handleState === "free"
          ? "libre"
          : null;

  return (
    <main className="relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center justify-between pt-[calc(64px+env(safe-area-inset-top))]">
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Volver a entrar con otro correo"
            className={CHIP_44}
          >
            <Stroke d={BACK_PATH} />
          </button>
        </form>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          2 de 2
        </span>
      </header>

      <form
        id="onboarding-account"
        onSubmit={submit}
        className="mt-[62px] flex flex-col gap-3.5"
      >
        <h1 className="font-brand text-[40px] font-normal leading-none text-text">
          elige tu usuario.
        </h1>
        <p className="text-[14px] leading-[1.5] text-text-2 text-pretty">
          Es tu link:{" "}
          <span className="text-text">baclog.app/{username || "usuario"}</span>
        </p>

        <div className="mt-3.5 flex flex-col gap-2.5">
          <label
            htmlFor="username"
            className={`${FIELD} flex cursor-text items-center gap-2.5 focus-within:bg-white/[0.11]`}
          >
            <span className="sr-only">Usuario</span>
            <span aria-hidden className={username ? "text-text" : "text-text-3"}>
              @
            </span>
            <input
              id="username"
              ref={usernameRef}
              value={username}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck={false}
              autoFocus
              aria-invalid={(answer !== null && answer !== "libre") || handleShort}
              aria-describedby="username-note"
              onChange={(e) => {
                setHandleState("idle");
                setUsername(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
                );
              }}
              placeholder="usuario"
              className="-ml-2 min-w-0 flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-text-3"
            />
            {answer && (
              <span
                className={`flex flex-none items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${
                  answer === "libre" ? "text-st-completed" : "text-text-2"
                }`}
              >
                {answer === "libre" && <Glyph kind="completed" size={13} />}
                {answer}
              </span>
            )}
          </label>

          <label htmlFor="name" className="sr-only">
            Tu nombre
          </label>
          <input
            id="name"
            ref={nameRef}
            required
            maxLength={50}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="tu nombre"
            className={FIELD}
          />

          <label htmlFor="birthYear" className="sr-only">
            Año de nacimiento
          </label>
          <input
            id="birthYear"
            ref={yearRef}
            required
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="bday-year"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))}
            placeholder="año de nacimiento"
            aria-describedby="year-note"
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] leading-[1.5] text-text-2 text-pretty">
          <p id="username-note">
            {handleState === "taken"
              ? "Ese usuario ya es de alguien. Prueba con otro."
              : handleState === "invalid" || handleShort
                ? "De 3 a 30 caracteres: letras, números, punto y guion bajo."
                : "Con usuario, tu perfil es público y lo apagas en Ajustes. Sin él, queda privado."}
          </p>
          <p>Tu nombre se puede cambiar después en Ajustes.</p>
          <p id="year-note">El año solo verifica tu edad. Nunca se muestra.</p>
        </div>
      </form>

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        {failed && (
          <FailLine>No se creó tu cuenta. Revisa el año e intenta de nuevo.</FailLine>
        )}
        <FlowCta
          type="submit"
          form="onboarding-account"
          ready={ready}
          busy={busy}
        >
          {busy ? "Creando…" : "Crear cuenta"}
        </FlowCta>
      </div>
    </main>
  );
}
