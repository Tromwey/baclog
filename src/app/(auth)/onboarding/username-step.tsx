"use client";

import { unstable_rethrow } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SITE_HOST } from "@/lib/site";
import {
  checkUsernameAction,
  claimUsernameAction,
  completeOnboardingAction,
} from "@/app/actions/account-actions";
import { BACK_PATH } from "@/components/glyph-paths";
import { SignOutForm } from "@/components/sign-out-form";
import { CHIP_44, FIELD, Glyph } from "@/components/kura/components";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import { FailLine, FlowCta, Stroke } from "./chrome";

type HandleState = "idle" | "free" | "taken" | "invalid";

const DATE_INVALID = "Esa fecha no es válida.";

/**
 * "YYYY-MM-DD" from the three fields, or null when they don't name a real
 * day that already happened (31 de febrero, a future date, year 0…). The
 * server re-checks all of it; this only saves the round trip.
 */
function birthDateOf(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (year.length !== 4 || !Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date rolls an impossible day over (31 feb → 3 mar): it must read back the same.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today) return null;
  const pad = (n: number, len: number) => String(n).padStart(len, "0");
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * Kura · O1b "elige tu usuario." — the second half of creating the account
 * (the email was the first, so the mark reads "2 de 2"). Volver at 64/24,
 * the title at 170, glass fields (radius 16, 52 tall), the solid "Crear
 * cuenta" at the foot.
 *
 * What the product keeps and the mock doesn't draw:
 *  - the birth DATE (F2.2; founder 2026-10-01: the age is exact). Three
 *    numeric fields — día / mes / año, same glass, no native date picker —
 *    sent as `birthDate: "YYYY-MM-DD"`; the server keeps only the year.
 *    Under 13 is turned away inside the action, which redirects to /blocked
 *    and never returns. A date the server refuses comes back in
 *    `fields.birthDate` and is shown under the field.
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
export function UsernameStep({
  onDone,
  resumeName = null,
}: {
  onDone: () => void;
  /** Set for an OLDER account (a name, no birth year): the screen asks only
   *  for the birth date, with the same field. No name is sent — the action
   *  leaves the stored one as is — and no handle is offered here (it has
   *  one, or chose not to; Ajustes is where that changes). */
  resumeName?: string | null;
}) {
  const resume = resumeName !== null;
  const usernameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const nameRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const dayRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState(resumeName ?? "");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  /** What's wrong with the date: ours, or the server's `fields.birthDate`. */
  const [dateError, setDateError] = useState<string | null>(null);
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [busy, setBusy] = useState(false);
  /** `refused` = the server answered `invalid` with no field to point at (not
   *  a connection problem, so it doesn't say "Revisa tu conexión"). */
  const [failed, setFailed] = useState<false | "unreached" | "refused">(false);

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
  const ready =
    (resume || name.trim().length > 0) &&
    birthDay.length > 0 &&
    birthMonth.length > 0 &&
    birthYear.length === 4 &&
    !handleShort;

  /** One of the three date fields changed: digits only, the old error goes,
   *  and a full day or month hands the caret to the next field. */
  function onDatePart(set: (v: string) => void, next?: "month" | "year") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, "");
      set(v);
      setDateError(null);
      if (next && v.length === 2) (next === "month" ? monthRef : yearRef).current?.focus();
    };
  }

  // Name + year first, then the claim if a handle was typed. A taken or
  // invalid handle keeps the user HERE; the name is already saved and
  // completeOnboardingAction is a plain UPDATE, so re-submitting just writes
  // it again. `refresh: false` — see claimUsernameAction: a revalidate here
  // re-requests the login chain's URL and yanks the user out of the flow.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setFailed(false);
    const birthDate = birthDateOf(birthDay, birthMonth, birthYear);
    if (!birthDate) {
      setDateError(DATE_INVALID);
      dayRef.current?.focus();
      return;
    }
    setBusy(true);
    setDateError(null);
    setHandleState("idle");
    try {
      const res = await completeOnboardingAction(resume ? { birthDate } : { name, birthDate });
      if (res.error) {
        const field = res.fields?.birthDate ?? res.fields?.birthYear;
        if (field) {
          setDateError(field);
          dayRef.current?.focus();
        } else setFailed("refused"); // the action's only refusal is `invalid`
        return;
      }
      if (!resume && username.length > 0) {
        const claim = await claimUsernameAction(username, { refresh: false });
        if (!("username" in claim)) {
          setHandleState(claim.error === "taken" ? "taken" : "invalid");
          usernameRef.current?.focus();
          return;
        }
      }
      onDone();
    } catch (err) {
      // Under 13 the action redirects to /blocked: Next's signal, not a failure.
      unstable_rethrow(err);
      setFailed("unreached");
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
        <SignOutForm>
          <button
            type="submit"
            aria-label="Volver a entrar con otro correo"
            className={CHIP_44}
          >
            <Stroke d={BACK_PATH} />
          </button>
        </SignOutForm>
        {!resume && (
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            2 de 2
          </span>
        )}
      </header>

      <form
        id="onboarding-account"
        onSubmit={submit}
        className="mt-[62px] flex flex-col gap-3.5"
      >
        <h1 className="font-brand text-[40px] font-normal leading-none text-text">
          {resume ? "solo falta tu fecha de nacimiento" : "elige tu usuario"}
        </h1>
        {resume ? (
          <p className="text-[14px] leading-[1.5] text-text-2 text-pretty">
            Nos falta tu fecha de nacimiento. Tus colecciones y tu perfil siguen como los dejaste.
          </p>
        ) : (
          <p className="text-[14px] leading-[1.5] text-text-2 text-pretty">
            Es tu link:{" "}
            <span className="text-text">{SITE_HOST}/{username || "usuario"}</span>
          </p>
        )}

        <div className="mt-3.5 flex flex-col gap-2.5">
          {!resume && (
          <>
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
            {/* Always mounted (a live region born WITH its text is not
                announced); empty, it takes no room — the negative margin
                cancels the row's gap. */}
            <span
              role="status"
              className={`flex flex-none items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] empty:-ml-2.5 ${
                answer === "libre" ? "text-st-completed" : "text-text-2"
              }`}
            >
              {answer === "libre" && <Glyph kind="completed" size={13} />}
              {answer}
            </span>
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
          </>
          )}

          <fieldset
            aria-describedby="birth-note birth-error"
            className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
          >
            <legend className="mb-2 p-0 text-[13px] leading-[1.5] text-text-2">
              Tu fecha de nacimiento
            </legend>
            <div className="flex gap-2.5">
              <input
                id="birthDay"
                ref={dayRef}
                required
                inputMode="numeric"
                pattern="[0-9]{1,2}"
                maxLength={2}
                autoComplete="bday-day"
                aria-label="Día"
                aria-invalid={dateError !== null}
                value={birthDay}
                onChange={onDatePart(setBirthDay, "month")}
                placeholder="día"
                autoFocus={resume}
                className={`${FIELD} min-w-0 flex-1 text-center`}
              />
              <input
                id="birthMonth"
                ref={monthRef}
                required
                inputMode="numeric"
                pattern="[0-9]{1,2}"
                maxLength={2}
                autoComplete="bday-month"
                aria-label="Mes"
                aria-invalid={dateError !== null}
                value={birthMonth}
                onChange={onDatePart(setBirthMonth, "year")}
                placeholder="mes"
                className={`${FIELD} min-w-0 flex-1 text-center`}
              />
              <input
                id="birthYear"
                ref={yearRef}
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="bday-year"
                aria-label="Año"
                aria-invalid={dateError !== null}
                value={birthYear}
                onChange={onDatePart(setBirthYear)}
                placeholder="año"
                className={`${FIELD} min-w-0 flex-[1.4] text-center`}
              />
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] leading-[1.5] text-text-2 text-pretty">
          {!resume && (
          <>
          <p id="username-note" role="status">
            {handleState === "taken"
              ? "Ese usuario ya es de alguien. Prueba con otro."
              : handleState === "invalid" || handleShort
                ? "Usa de 3 a 30 letras sin acento, números, punto o guion bajo. Algunos nombres están reservados."
                : "Con usuario, tu perfil es público y lo apagas en Ajustes. Sin él, queda privado."}
          </p>
          <p>Tu nombre se puede cambiar después en Ajustes.</p>
          </>
          )}
          <p id="birth-note">
            Solo confirma que tienes 13 o más. Guardamos únicamente el año y no se muestra a nadie.
          </p>
          {/* Always mounted (regla de la ronda 3); empty, it takes no room. */}
          <p id="birth-error" role="alert" className="text-text empty:-mt-1.5">
            {dateError}
          </p>
        </div>
      </form>

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        {failed && (
          <FailLine>
            {failed === "refused"
              ? "No se pudo crear tu cuenta. Revisa el usuario y la fecha."
              : resume
                ? "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo."
                : "No se pudo crear tu cuenta. Revisa tu conexión y vuelve a intentarlo."}
          </FailLine>
        )}
        <FlowCta
          type="submit"
          form="onboarding-account"
          ready={ready}
          busy={busy}
        >
          {resume ? (busy ? "Guardando…" : "Continuar") : busy ? "Creando…" : "Crear cuenta"}
        </FlowCta>
      </div>
    </main>
  );
}
