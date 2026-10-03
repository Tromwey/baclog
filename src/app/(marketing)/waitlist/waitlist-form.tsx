"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist-actions";
import { attempt } from "@/components/kura/attempt";
import { FIELD, SOLID_BUTTON } from "@/components/kura/components";
import { PositionCard } from "./position-card";

/** An address that was ALREADY in line may come back without its place or
 *  its invite code (the server doesn't hand those to whoever types a
 *  stranger's address): every field but "you're in" is optional. */
type Joined = {
  position?: number | null;
  referralCode?: string | null;
  referralCount?: number | null;
  alreadyJoined?: boolean;
};

export function WaitlistForm() {
  const refCode = useSearchParams().get("ref") ?? undefined;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "invalid" | "limited" | "error">("idle");
  const [joined, setJoined] = useState<Joined | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    // `attempt`: a rejected action (no network) is the same visible failure
    // as a refusal — never "Apartando…" forever.
    const res = await attempt(() => joinWaitlistAction({ email, refCode }));
    if (res.ok) {
      setJoined(res.value);
      setStatus("idle");
    } else {
      setStatus(
        res.error === "invalid" ? "invalid" : res.error === "rate_limited" ? "limited" : "error",
      );
    }
  }

  if (joined) return <PositionCard {...joined} />;

  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
      <label htmlFor="waitlist-email" className="sr-only">
        Tu correo
      </label>
      <input
        id="waitlist-email"
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
        {status === "sending" ? "Apartando…" : "Apartarme un lugar"}
      </button>
      <div role="alert" className="empty:-mt-3">
        {(status === "error" || status === "invalid" || status === "limited") && (
          <p className="text-center text-[13px] leading-[1.5] text-text">
            {status === "invalid"
              ? "Ese correo no se ve bien. Revísalo y vuelve a intentarlo."
              : status === "limited"
                ? "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo."
                : "No pudimos apartarte el lugar. Revisa tu conexión y vuelve a intentarlo."}
          </p>
        )}
      </div>
      {refCode && (
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          entras con una invitación
        </p>
      )}
      <p className="text-center text-[13px] leading-[1.5] text-text-2">
        Solo te avisamos cuando tengas acceso. Nada más.
      </p>
    </form>
  );
}
