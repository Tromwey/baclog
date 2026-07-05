"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <h1 className="font-mono text-2xl font-bold tracking-[0.35em]">BACLOG</h1>
      <p className="mt-2 max-w-xs text-center text-sm text-neutral-400">
        Te mandamos un código a{" "}
        <span className="text-neutral-200">{email || "tu email"}</span>
      </p>

      <form onSubmit={verify} className="mt-10 w-full max-w-sm space-y-3">
        <label className="block text-sm text-neutral-300" htmlFor="code">
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
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={status === "checking" || code.length !== 6}
          className="w-full rounded-full bg-neutral-100 py-3.5 font-semibold text-neutral-900 disabled:opacity-40"
        >
          {status === "checking" ? "Verificando…" : "Entrar"}
        </button>
        {status === "wrong" && (
          <p className="text-sm text-red-400">
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
