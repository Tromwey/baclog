"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist-actions";
import { FIELD, SOLID_BUTTON } from "@/app/u/kura/components";
import { PositionCard } from "./position-card";

type Joined = {
  position: number;
  referralCode: string;
  referralCount: number;
  alreadyJoined: boolean;
};

export function WaitlistForm() {
  const refCode = useSearchParams().get("ref") ?? undefined;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [joined, setJoined] = useState<Joined | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const res = await joinWaitlistAction({ email, refCode });
    if ("ok" in res) {
      setJoined(res);
      setStatus("idle");
    } else {
      setStatus("error");
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
      {status === "error" && (
        <p className="text-center text-[13px] leading-[1.5] text-text">
          No pudimos apartarte el lugar. Revisa el correo e intenta de nuevo.
        </p>
      )}
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
