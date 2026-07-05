"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "cooldown">(
    "idle",
  );

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      router.push(`/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    setStatus(res.status === 429 ? "cooldown" : "error");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <h1 className="font-mono text-2xl font-bold tracking-[0.35em]">BACLOG</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Tus obsesiones, en una tarjeta.
      </p>

      <form onSubmit={requestCode} className="mt-10 w-full max-w-sm space-y-3">
        <label className="block text-sm text-neutral-300" htmlFor="email">
          Tu email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-full bg-neutral-100 py-3.5 font-semibold text-neutral-900 disabled:opacity-40"
        >
          {status === "sending" ? "Enviando…" : "Enviarme un código"}
        </button>
        {status === "error" && (
          <p className="text-sm text-red-400">
            No pudimos enviar el código. Intenta de nuevo.
          </p>
        )}
        {status === "cooldown" && (
          <p className="text-sm text-amber-400">
            Ya te enviamos un código hace poco — espera un minuto.
          </p>
        )}
        <p className="pt-2 text-xs text-neutral-500">
          Sin contraseñas. Te mandamos un código de 6 dígitos.
        </p>
      </form>
    </main>
  );
}
