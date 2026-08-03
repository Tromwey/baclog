import "server-only";
import { env } from "@/lib/env";

/**
 * Email transport seam (launch dep: founder provides RESEND_API_KEY).
 * Console transport keeps flows buildable/testable today; Resend swaps in
 * behind the same function with zero call-site changes.
 */
async function send(
  to: string,
  subject: string,
  text: string,
  devLabel: string,
): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Baclog <auth@baclog.app>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    }
    return;
  }
  console.log(`[dev-mailer] ${devLabel} para ${to}: ${text}`);
}

export function sendOtpEmail(email: string, code: string): Promise<void> {
  return send(
    email,
    `${code} es tu código de Baclog`,
    `Tu código de acceso es ${code}. Expira en 10 minutos.`,
    "OTP",
  );
}

/**
 * F3.8 — the release-day notice. The whole point of the feature's back half:
 * you put something in your backlog before it existed, and on the morning it
 * exists, we say so.
 *
 * The copy names the wait itself ("cuando faltaban 42 días") because that's the
 * only thing this email knows that a store notification doesn't. `waitedDays`
 * is null when we can't reconstruct it (added after the date was already known
 * to be past), and the sentence is simply dropped rather than faked.
 *
 * The footer carries the opt-out (users.notifyReleases, toggled in /settings)
 * so the only way to stop the notice isn't deleting the album you waited for.
 */
export function sendReleaseEmail(
  email: string,
  album: {
    title: string;
    byline: string | null;
    itemUrl: string;
    addedOn: string | null;
    waitedDays: number | null;
  },
): Promise<void> {
  const artist = album.byline ? `, de ${album.byline}` : "";
  const waited =
    album.addedOn && album.waitedDays != null && album.waitedDays > 0
      ? `Lo agregaste a tu backlog el ${album.addedOn}, cuando faltaban ${album.waitedDays} días. La espera terminó.\n\n`
      : "";
  const body =
    `Hoy sale ${album.title}${artist}.\n\n` +
    waited +
    `Escúchalo: ${album.itemUrl}\n\n` +
    `—\nTe avisamos porque está en tu backlog. Si no quieres estos avisos, ` +
    `apágalos en https://baclog.app/settings`;
  return send(email, `${album.title} ya salió ✦`, body, "RELEASE");
}

/** F3.3 — monthly recap notification. */
export function sendRecapEmail(
  email: string,
  recap: { label: string; totalItems: number; completedCount: number },
): Promise<void> {
  // Recap has no permanent nav tab (it's a monthly moment) — this link is its
  // in-app entry point, so the ritual stays reachable without a constant tab.
  const body = `Tu ${recap.label} en Baclog: ${recap.totalItems} obsesiones, ${recap.completedCount} completadas. Ve y comparte tu tarjeta del mes: https://baclog.app/recap`;
  return send(email, `Tu ${recap.label} está lista ✦`, body, "RECAP");
}
