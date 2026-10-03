"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import { FIELD, GLASS_BUTTON, SOLID_BUTTON, Wordmark } from "@/components/kura/components";
import { carryReturnTo } from "../return-to-param";
import { stashPendingEmail } from "../pending-email";
import { continueWithAppleAction } from "./actions";

/**
 * Kura · O1c "entrar." (design/kura/flujos-v2.dc.html, flujo 01 · rama "ya
 * tengo cuenta"). The mock offers Apple, Google and a magic link; the product
 * signs in with Apple (when the server has it configured — `appleEnabled`,
 * src/auth/apple-web.ts) and with a one-time code by email (src/auth): title
 * at 170 from the top, "Continuar con Apple" as the mock's solid action, then
 * the "o con correo" branch — the glass field (radius 16, 52 tall) and its
 * glass action — and one plain note. No password, no red — errors are stated
 * in words (§patrones · error); `error` is what Auth.js appended to the URL
 * when an Apple sign-in was refused (src/auth/config.ts).
 *
 * Public surface: wears the `.kura` scope (globals.css) so the shared
 * primitives come out in honey/Newsreader without touching the signed-in app.
 */
export function LoginForm({
  appleEnabled,
  error,
  returnTo,
}: {
  appleEnabled: boolean;
  error: string | null;
  /** The page's `?to=`, already through `safeReturnTo` (login/page.tsx). */
  returnTo: string | null;
}) {
  const router = useRouter();
  const emailRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "error" | "offline" | "cooldown" | "limited" | "network"
  >("idle");
  /** Seconds the server asked to wait (429 `retryAfterSeconds` / `Retry-After`). */
  const [waitSeconds, setWaitSeconds] = useState(60);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    let res: Response;
    try {
      res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // No network: `fetch` REJECTS. Without this the button stayed on
      // "Enviando…" forever, disabled — now it's a retry.
      setStatus("offline");
      return;
    }
    if (res.ok) {
      toVerify();
      return;
    }
    if (res.status !== 429) {
      setStatus("error");
      return;
    }
    // 429 comes in three kinds (`reason`), and only ONE of them means a code
    // is sitting in the inbox:
    //  - "cooldown": a code was just sent to this address → offer /verify.
    //  - "hourly_cap" / "ip_limit" (or anything else): nothing was sent, and
    //    there may be no live code at all → never claim there is one; say
    //    how long the wait really is.
    // A server that doesn't send `reason` yet is read as a cooldown only
    // when the wait is the cooldown's (≤ 60 s).
    const body: unknown = await res.json().catch(() => null);
    const field = (key: string): unknown =>
      body !== null && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
    const reason = typeof field("reason") === "string" ? (field("reason") as string) : null;
    const fromBody = Number(field("retryAfterSeconds"));
    const fromHeader = Number(res.headers.get("Retry-After"));
    const wait =
      Number.isFinite(fromBody) && fromBody > 0
        ? fromBody
        : Number.isFinite(fromHeader) && fromHeader > 0
          ? fromHeader
          : 60;
    setWaitSeconds(wait);
    setStatus(
      reason === "cooldown" || (reason === null && wait <= 60)
        ? "cooldown"
        : reason === "ip_limit"
          ? "network"
          : "limited",
    );
  }

  /** On to the code. The address goes by sessionStorage, never the URL. */
  function toVerify() {
    stashPendingEmail(email);
    router.push(carryReturnTo("/verify"));
  }

  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark variant="C" />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="mb-1 font-brand text-[40px] leading-none text-text">entrar.</h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Guarda películas, series y álbumes en colecciones, y mira lo que
          obsesiona a tu gente.
        </p>

        {appleEnabled && (
          <form action={continueWithAppleAction} className="mt-5 flex flex-col gap-3">
            {returnTo && <input type="hidden" name="to" value={returnTo} />}
            <button type="submit" className={SOLID_BUTTON}>
              <AppleGlyph />
              Continuar con Apple
            </button>
            {error && (
              <p className="text-center text-[13px] leading-[1.5] text-text">
                No pudimos confirmar tu cuenta de Apple. Vuelve a intentarlo o entra con tu correo.
              </p>
            )}
          </form>
        )}

        <form onSubmit={requestCode} className={`${appleEnabled ? "mt-3" : "mt-5"} flex flex-col gap-3`}>
          <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
            {appleEnabled ? "o con correo" : "con correo"}
          </span>
          <label htmlFor="email" className="sr-only">
            Tu correo
          </label>
          <input
            id="email"
            ref={emailRef}
            type="email"
            required
            autoFocus={!appleEnabled}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={FIELD}
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className={appleEnabled ? `${GLASS_BUTTON} h-[52px] text-[16px]` : SOLID_BUTTON}
          >
            {status === "sending" ? "Enviando…" : "Enviarme un código"}
          </button>
          {status === "error" && (
            <p role="alert" className="text-center text-[13px] leading-[1.5] text-text">
              No pudimos enviar el código. Revisa el correo y vuelve a intentarlo.
            </p>
          )}
          {status === "offline" && (
            <p role="alert" className="text-center text-[13px] leading-[1.5] text-text">
              Sin conexión. Revisa tu red y vuelve a intentarlo.
            </p>
          )}
          {status === "cooldown" && (
            // This 429 means a code IS already in the inbox: the way to use
            // it has to be right here, not a minute away.
            <div role="alert" className="flex flex-col items-center gap-3">
              <p className="text-center text-[13px] leading-[1.5] text-text">
                Ya te enviamos un código hace poco y sigue siendo válido. Revisa tu correo o espera {waitLabel(waitSeconds)} para pedir otro.
              </p>
              <button type="button" onClick={toVerify} className={GLASS_BUTTON}>
                Ya tengo el código
              </button>
            </div>
          )}
          {status === "limited" && (
            // Hourly cap for this address: no code was sent and none is promised.
            <p role="alert" className="text-center text-[13px] leading-[1.5] text-text">
              Se pidieron demasiados códigos para este correo. Podrás pedir otro en {waitLabel(waitSeconds)}.
            </p>
          )}
          {status === "network" && (
            // Per-IP limit: it says nothing about this address.
            <p role="alert" className="text-center text-[13px] leading-[1.5] text-text">
              Demasiados intentos desde esta red. Podrás pedir un código en {waitLabel(waitSeconds)}.
            </p>
          )}
          <p className="text-center text-[13px] leading-[1.5] text-text-2 text-pretty">
            Sin contraseña: te enviamos un código de 6 dígitos. Si es tu
            primera vez, ese mismo correo crea tu cuenta.
          </p>
        </form>
      </div>

      {/* The notice must be within reach BEFORE the email is collected
          (LFPDPPP tacit consent) — so it sits on this screen, not only in Ajustes. */}
      <p className="mt-auto pt-10 text-center text-[13px] leading-[1.5] text-text-2 text-pretty">
        Cómo cuidamos tus datos:{" "}
        <Link
          href="/privacidad"
          className="text-text underline decoration-text-3 underline-offset-[3px] transition-opacity active:opacity-60"
        >
          aviso de privacidad
        </Link>
        .
      </p>
    </main>
  );
}

/** "40 segundos" · "1 minuto" · "12 minutos" — minutes once the wait passes 60 s. */
function waitLabel(seconds: number): string {
  if (seconds > 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minutos`;
  }
  if (seconds === 60) return "1 minuto";
  const s = Math.max(1, Math.ceil(seconds));
  return s === 1 ? "1 segundo" : `${s} segundos`;
}

/** The Apple mark of the mock's "Continuar con Apple" (18 px, currentColor). */
function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.4-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" />
    </svg>
  );
}
