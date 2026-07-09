"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthAuraBackdrop, Button } from "@/components/ui";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <AuthAuraBackdrop seed={34} />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <h1 className="font-mono text-xl font-bold uppercase tracking-[0.35em] text-accent">
          Baclog
        </h1>
        <p className="mt-3 max-w-xs text-center text-sm text-text-2">
          Te mandamos un código a{" "}
          <span className="text-text">{email || "tu email"}</span>
        </p>

        <form onSubmit={verify} className="mt-10 w-full space-y-3">
          <label className="block text-sm text-text-2" htmlFor="code">
            Código de 6 dígitos
          </label>
          <input
            id="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className="w-full rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-text outline-none transition-colors placeholder:text-text-3 focus:border-accent"
          />
          <Button
            type="submit"
            disabled={status === "checking" || code.length !== 6}
            className="w-full"
          >
            {status === "checking" ? "Verificando…" : "Entrar"}
          </Button>
          {status === "wrong" && (
            <p className="text-sm text-hot">
              Código incorrecto o expirado.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => router.push("/login")}
              >
                Pedir otro
              </button>
            </p>
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
