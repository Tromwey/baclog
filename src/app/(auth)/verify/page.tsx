"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import {
  FIELD,
  GLASS_BUTTON,
  SKELETON_PULSE,
  SOLID_BUTTON,
  Wordmark,
} from "@/components/kura/components";
import { carryReturnTo, returnToParam } from "../return-to-param";
import { clearPendingEmail, readPendingEmail, stashPendingEmail } from "../pending-email";

const noSubscribe = () => () => {};

/**
 * Kura · the second half of "entrar." — the code the email carries. Same
 * skeleton as /login (wordmark at 64, title at 170, glass field, solid
 * action); the code field is mono, centred and spaced so six digits read as
 * six digits. Public surface (`.kura` scope).
 */
function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  // The address comes from sessionStorage (/login put it there). `?email=` is
  // only still read for a link opened mid-deploy from the old /login, and is
  // scrubbed from the URL at once. With neither (storage blocked, a new tab),
  // the form asks for it again instead of failing every code.
  const legacy = params.get("email") ?? "";
  const stashed = useSyncExternalStore(noSubscribe, readPendingEmail, () => "");
  const known = stashed || legacy;
  // sessionStorage can't be read while hydrating (the server snapshot is ""),
  // so on a hard load `known` arrives one render late. Until then the page
  // doesn't know whether it must ask for the address: the email field waits
  // for `hydrated` instead of flashing in and out.
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [typed, setTyped] = useState("");
  const email = known || typed.trim();
  useEffect(() => {
    if (!legacy) return;
    stashPendingEmail(legacy);
    const url = new URL(window.location.href);
    url.searchParams.delete("email");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [legacy]);

  const codeRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [code, setCode] = useState("");
  // `autoFocus` only acts on mount, and on a hard load the field mounts
  // before `known` exists: focus it when the address shows up.
  useEffect(() => {
    if (known) codeRef.current?.focus();
  }, [known, codeRef]);
  const [status, setStatus] = useState<"idle" | "checking" | "wrong" | "locked" | "server" | "offline">("idle");

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("checking");
    // No network: signIn REJECTS. The code is still good — say so and let
    // the same button try again, instead of "Entrando…" forever.
    const res = await signIn("otp", { email, code, redirect: false }).catch(
      () => "offline" as const,
    );
    if (res === "offline") {
      setStatus("offline");
      return;
    }
    if (res?.error) {
      // What the server lets us tell apart (`src/auth/config.ts`): a
      // `CredentialsSignin` whose `code` is "locked" = refused for too many
      // attempts (the code was not even judged: typing it again, or another,
      // won't help until the wait passes); any other `CredentialsSignin` = a
      // wrong or spent/expired code. A server that sends no `code` (an older
      // build) falls in the second sentence, which still covers the limit.
      // Anything ELSE (`Configuration` = `authorize` threw, a 5xx) is OUR
      // failure: the code was never judged, so don't call it wrong.
      const locked = (res as { code?: string }).code === "locked";
      setStatus(res.error !== "CredentialsSignin" ? "server" : locked ? "locked" : "wrong");
      return;
    }
    clearPendingEmail();
    // Hard navigation on purpose: the client router pre-sign-in has no
    // session and would serve stale redirects from its cache.
    window.location.href = returnToParam() ?? "/backlogs";
  }

  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark variant="C" />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="mb-1 font-brand text-[40px] leading-none text-text">revisa tu correo</h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Te enviamos un código a{" "}
          <span className="text-text">{known || "tu correo"}</span>.
        </p>

        <form onSubmit={verify} className="mt-5 flex flex-col gap-3">
          {hydrated && !known && (
            <>
              <label htmlFor="email" className="sr-only">
                El correo al que llegó el código
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="tu@correo.com"
                className={FIELD}
              />
            </>
          )}
          <label htmlFor="code" className="sr-only">
            Código de 6 dígitos
          </label>
          <input
            id="code"
            ref={codeRef}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus={Boolean(known)}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className={`${FIELD} text-center font-mono text-[24px] tracking-[0.3em]`}
          />
          <button
            type="submit"
            disabled={status === "checking" || code.length !== 6}
            className={SOLID_BUTTON}
          >
            {status === "checking" ? "Entrando…" : "Entrar"}
          </button>
          {status === "offline" && (
            <p role="alert" className="pt-1 text-center text-[13px] leading-[1.5] text-text">
              Sin conexión. Tu código sigue siendo válido: revisa tu red y vuelve a intentarlo.
            </p>
          )}
          {status === "server" && (
            <p role="alert" className="pt-1 text-center text-[13px] leading-[1.5] text-text">
              Algo falló de nuestro lado y no pudimos revisar tu código. Vuelve a intentarlo en un momento.
            </p>
          )}
          {(status === "wrong" || status === "locked") && (
            <div role="alert" className="flex flex-col items-center gap-3 pt-1">
              <p className="text-center text-[13px] leading-[1.5] text-text text-pretty">
                {status === "locked"
                  ? "Se intentó demasiadas veces. Pide otro código más tarde."
                  : "El código es incorrecto o ya venció. Revísalo o pide otro."}
              </p>
              <button
                type="button"
                onClick={() => router.push(carryReturnTo("/login"))}
                className={GLASS_BUTTON}
              >
                Enviar otro código
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

/**
 * What paints before useSearchParams resolves (a hard load prerenders only
 * this): the same chrome at the same geometry — wordmark, title, a disabled
 * code field and Entrar — with only the address, which is still unknown,
 * as a pulsing bar. Without it the page flashed blank.
 */
function VerifyFallback() {
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark variant="C" />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="mb-1 font-brand text-[40px] leading-none text-text">revisa tu correo</h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Te enviamos un código a{" "}
          <span
            aria-hidden
            className={`inline-block h-3.5 w-36 translate-y-0.5 rounded-full bg-surface-1 ${SKELETON_PULSE}`}
          />
          .
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <input
            disabled
            aria-label="Código de 6 dígitos"
            placeholder="000000"
            className={`${FIELD} text-center font-mono text-[24px] tracking-[0.3em]`}
          />
          <button type="button" disabled className={SOLID_BUTTON}>
            Entrar
          </button>
        </div>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyForm />
    </Suspense>
  );
}
