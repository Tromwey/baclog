"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuraField, Button } from "@/components/ui";

// No signed-in user here → a fixed brand ADN set (AuraField forces lima first).
const LOGIN_ADN = ["#C7462F", "#3A5A9B", "#9B4DCA", "#E8B23A", "#7AA2FF"];

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
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-6 text-text">
      <AuraField
        variant="ambient"
        colors={LOGIN_ADN}
        seed={21}
        className="!opacity-[0.5]"
      />
      {/* Keep the form legible over the aura. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, transparent 0%, rgba(11,11,13,0.55) 62%, #0B0B0D 100%)",
        }}
      />
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <h1 className="font-mono text-xl font-bold uppercase tracking-[0.35em] text-accent">
          Baclog
        </h1>
        <p className="mt-3 font-serif text-lg italic text-text-2">
          Tus obsesiones, en una tarjeta.
        </p>
        <p className="mt-4 max-w-[34ch] text-center text-sm leading-relaxed text-text-2">
          Guarda las películas, series y álbumes que amas. Baclog te devuelve
          conexiones cross-media que sí pegan y tarjetas hechas para compartir.
        </p>

        <form onSubmit={requestCode} className="mt-8 w-full space-y-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              Entra o regístrate · un paso
            </p>
            <label className="mt-1.5 block text-sm text-text-2" htmlFor="email">
              Tu email
            </label>
          </div>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-[var(--r-md)] border border-line bg-surface-2 px-4 py-3 text-base text-text outline-none transition-colors placeholder:text-text-3 focus:border-accent"
          />
          <Button type="submit" disabled={status === "sending"} className="w-full">
            {status === "sending" ? "Enviando…" : "Enviarme un código"}
          </Button>
          {status === "error" && (
            <p className="text-sm text-hot">
              No pudimos enviar el código. Intenta de nuevo.
            </p>
          )}
          {status === "cooldown" && (
            <p className="text-sm text-radar">
              Ya te enviamos un código hace poco — espera un minuto.
            </p>
          )}
          <p className="pt-2 text-xs leading-relaxed text-text-3">
            No necesitas una cuenta previa: tu correo te registra o te deja
            entrar. Sin contraseñas —solo un código de 6 dígitos.
          </p>
        </form>
      </div>
    </main>
  );
}
