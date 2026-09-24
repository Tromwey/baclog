"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import { FIELD, GLASS_BUTTON, SOLID_BUTTON, Wordmark } from "@/components/kura/components";

/**
 * Kura · the second half of "entrar." — the code the email carries. Same
 * skeleton as /login (wordmark at 64, title at 170, glass field, solid
 * action); the code field is mono, centred and spaced so six digits read as
 * six digits. Public surface (`.kura` scope).
 */
function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const codeRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong">("idle");

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("checking");
    const res = await signIn("otp", { email, code, redirect: false });
    if (res?.error) {
      setStatus("wrong");
      return;
    }
    // Hard navigation on purpose: the client router pre-sign-in has no
    // session and would serve stale redirects from its cache.
    window.location.href = "/backlogs";
  }

  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="mb-1 font-brand text-[40px] leading-none text-text">revisa tu correo.</h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Te mandamos un código a{" "}
          <span className="text-text">{email || "tu correo"}</span>.
        </p>

        <form onSubmit={verify} className="mt-5 flex flex-col gap-3">
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
            autoFocus
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
          {status === "wrong" && (
            <div className="flex flex-col items-center gap-3 pt-1">
              <p className="text-center text-[13px] leading-[1.5] text-text">
                Código incorrecto o vencido. Pide otro y vuelve a intentar.
              </p>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className={GLASS_BUTTON}
              >
                Pedir otro código
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
