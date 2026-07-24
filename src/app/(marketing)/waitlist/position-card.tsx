"use client";

import { useState } from "react";
import { plural } from "@/lib/plural";

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
      : `https://baclog.app/waitlist?ref=${referralCode}`;

  async function share() {
    const text = `Aparté mi lugar en Baclog. Entra con mi invitación 👉`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Baclog", text, url: link });
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
    <div className="mt-8 space-y-4">
      <div className="rounded-2xl bg-surface-1 p-6">
        <p className="text-sm text-text-2">
          {alreadyJoined ? "Ya estabas en la fila" : "¡Estás dentro!"}
        </p>
        <p className="mt-1 font-mono text-4xl font-bold">#{position}</p>
        <p className="mt-1 text-xs text-text-3">
          {referralCount > 0
            ? `${referralCount} ${plural(referralCount, "invitado", "invitados")} · cada uno te sube 3 lugares`
            : "Invita gente y sube 3 lugares por cada uno"}
        </p>
      </div>

      <button
        onClick={share}
        className="w-full rounded-full bg-accent py-3.5 font-semibold text-bg"
      >
        {copied ? "Link copiado ✓" : "Invitar y subir en la fila"}
      </button>
      <p className="break-all text-xs text-text-3">{link}</p>
    </div>
  );
}
