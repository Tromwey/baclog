"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { joinWaitlistAction } from "@/app/actions/waitlist-actions";
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
    <form onSubmit={submit} className="mt-8 space-y-3">
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        className="w-full rounded-xl bg-surface-2 px-4 py-3 text-center outline-none transition-colors focus:bg-surface-3"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg disabled:opacity-40"
      >
        {status === "sending" ? "Apartando…" : "Apártame un lugar"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-400">Revisa tu email e intenta de nuevo.</p>
      )}
      {refCode && (
        <p className="text-xs text-text-3">Entras con una invitación 🎟️</p>
      )}
      <p className="pt-1 text-xs text-text-3">
        Solo te avisamos cuando tengas acceso. Nada más.
      </p>
    </form>
  );
}
