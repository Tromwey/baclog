"use client";

import { useState } from "react";
import { plural } from "@/lib/plural";
import { SOLID_BUTTON } from "@/components/kura/components";

/**
 * Kura · your place in line: a `--s1` group (radius 18) with the position as
 * the one big datum in mono, then the solid share action. No confetti —
 * the number is the celebration (§movimiento: "se anima lo que el usuario
 * hace, nunca lo que cambia solo").
 */
export function PositionCard({
  position,
  referralCode,
  referralCount,
  alreadyJoined,
}: {
  position: number;
  referralCode: string;
  referralCount: number;
  alreadyJoined: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/waitlist?ref=${referralCode}`
      : `/waitlist?ref=${referralCode}`;

  async function share() {
    const text = "Aparté mi lugar en kura. Entra con mi invitación:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "kura", text, url: link });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[var(--r-surface)] bg-surface-1 p-6">
        <span className="font-brand text-[22px] leading-none text-text">
          {alreadyJoined ? "ya estabas en la fila." : "estás dentro."}
        </span>
        <span className="font-mono text-[40px] leading-none text-text">#{position}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {referralCount > 0
            ? `${referralCount} ${plural(referralCount, "invitado", "invitados")} · cada uno te sube 3 lugares`
            : "cada invitado te sube 3 lugares"}
        </span>
      </div>
      <button type="button" onClick={share} className={SOLID_BUTTON}>
        {copied ? "Link copiado" : "Invitar y subir en la fila"}
      </button>
      <p className="break-all text-center font-mono text-[11px] text-text-3">{link}</p>
    </div>
  );
}
