"use client";

import { useState } from "react";
import { plural } from "@/lib/plural";
import { SITE_URL } from "@/lib/site";
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
  alreadyJoined = false,
}: {
  /** Absent for an address that was already in line (see `WaitlistForm`). */
  position?: number | null;
  referralCode?: string | null;
  referralCount?: number | null;
  alreadyJoined?: boolean;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
  // The one public origin (src/lib/site.ts), the same string on the server
  // and in the browser: `window.location.origin` rendered "/waitlist?…" in
  // SSR and the full URL on the client — a hydration mismatch on the visible
  // link, and a share link pointing at whatever host served the page.
  const link = referralCode ? `${SITE_URL}/waitlist?ref=${referralCode}` : null;
  const invited = referralCount ?? 0;

  async function share() {
    if (!link) return;
    const text = "Aparté mi lugar en kura. Entra con mi invitación:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "kura", text, url: link });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    // No share sheet (desktop) → the clipboard. It can refuse too (no
    // permission, an insecure context, an in-app browser): then say so and
    // point at the link printed below, which is always selectable.
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("manual");
    }
    setTimeout(() => setCopy("idle"), 4000);
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[var(--r-surface)] bg-surface-1 p-6">
        <span className="font-brand text-[22px] leading-none text-text">
          {alreadyJoined ? "ya estabas en la fila" : "estás dentro"}
        </span>
        {typeof position === "number" ? (
          <span className="font-mono text-[40px] leading-none text-text">#{position}</span>
        ) : (
          <span className="text-[15px] leading-[1.5] text-text-2">
            Tu lugar sigue apartado. Te avisamos por correo cuando tengas acceso.
          </span>
        )}
        {link && (
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            {invited > 0
              ? `${invited} ${plural(invited, "invitado", "invitados")} · cada uno te sube 3 lugares`
              : "cada invitado te sube 3 lugares"}
          </span>
        )}
      </div>
      {link && (
        <>
          <button type="button" onClick={share} className={SOLID_BUTTON}>
            {copy === "copied" ? "Link copiado" : "Invitar y subir en la fila"}
          </button>
          <p className="select-all break-all text-center font-mono text-[11px] text-text-3">{link}</p>
          <p role="status" className="text-center text-[13px] leading-[1.5] text-text empty:-mt-3">
            {copy === "manual" && "No se pudo copiar. Copia el link de arriba a mano."}
          </p>
        </>
      )}
    </div>
  );
}
