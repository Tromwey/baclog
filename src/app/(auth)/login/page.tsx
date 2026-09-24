"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScrollIntoViewOnKeyboard } from "@/hooks/use-scroll-into-view-on-keyboard";
import { FIELD, SOLID_BUTTON, Wordmark } from "@/components/kura/components";

/**
 * Kura · O1c "entrar." (design/kura/flujos-v2.dc.html, flujo 01 · rama "ya
 * tengo cuenta"). The mock offers Apple, Google and a magic link; the product
 * signs in with a one-time code by email (src/auth), so this is the "o con
 * correo" branch of that screen, alone: title at 170 from the top, the glass
 * field (radius 16, 52 tall), the solid action, and one plain note. No
 * password, no red — errors are stated in words (§patrones · error).
 *
 * Public surface: wears the `.kura` scope (globals.css) so the shared
 * primitives come out in honey/Newsreader without touching the signed-in app.
 */
export default function LoginPage() {
  const router = useRouter();
  const emailRef = useScrollIntoViewOnKeyboard<HTMLInputElement>();
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
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-11 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>

      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="mb-1 font-brand text-[40px] leading-none text-text">entrar.</h1>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
          Guarda películas, series y música en colecciones, y mira lo que
          obsesiona a tu gente.
        </p>

        <form onSubmit={requestCode} className="mt-5 flex flex-col gap-3">
          <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
            con correo
          </span>
          <label htmlFor="email" className="sr-only">
            Tu correo
          </label>
          <input
            id="email"
            ref={emailRef}
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className={FIELD}
          />
          <button type="submit" disabled={status === "sending"} className={SOLID_BUTTON}>
            {status === "sending" ? "Enviando…" : "Enviarme un código"}
          </button>
          {status === "error" && (
            <p className="text-center text-[13px] leading-[1.5] text-text">
              No pudimos enviar el código. Revisa el correo e intenta de nuevo.
            </p>
          )}
          {status === "cooldown" && (
            <p className="text-center text-[13px] leading-[1.5] text-text">
              Ya te enviamos un código hace poco. Espera un minuto.
            </p>
          )}
          <p className="text-center text-[13px] leading-[1.5] text-text-2 text-pretty">
            Sin contraseña: te mandamos un código de 6 dígitos. Si es tu
            primera vez, ese mismo correo crea tu cuenta.
          </p>
        </form>
      </div>
    </main>
  );
}
