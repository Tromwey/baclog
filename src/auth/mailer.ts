import "server-only";
import { env } from "@/lib/env";
import { SITE_URL } from "@/lib/site";
import type { MediaType } from "@/modules/catalog/types";
import { monthName } from "@/modules/backlog/recap-format";

/**
 * Every email closes with a small signature, so §marca · B "sello": KURA.
 * The emails are plain text — no Red Hat Mono and no +24 % tracking to carry
 * it — so the most faithful form is the seal's own letters, uppercase. Never
 * the kanji (C is for onboarding/press/merch) and never letter-spaced by hand
 * ("K U R A" reads as four letters to a screen reader).
 */
const SIGNATURE = "\n\n— KURA";

/**
 * Email transport seam (launch dep: founder provides RESEND_API_KEY).
 * Console transport keeps flows buildable/testable today; Resend swaps in
 * behind the same function with zero call-site changes.
 */
async function send(
  to: string,
  subject: string,
  body: string,
  devLabel: string,
): Promise<void> {
  const text = body + SIGNATURE;
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Display name entre comillas: los paréntesis son sintaxis de comentario en RFC 5322.
        // El remitente sigue en baclog.app A PROPÓSITO: Resend solo manda desde un
        // dominio verificado (DKIM/SPF), y get-kura.app aún no está verificado ahí.
        // Cuando el founder lo verifique en Resend, cambiar a auth@get-kura.app.
        from: `"kura (anteriormente Baclog)" <auth@baclog.app>`,
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
    `${code} es tu código de kura`,
    `Tu código de acceso es ${code}. Expira en 10 minutos.`,
    "OTP",
  );
}

/**
 * Phase 4g — the code that proves you own THIS address's Kura account so
 * another account you're signed into can absorb it. Same transport and shape
 * as the login code; the copy says what the code does (merging, not signing
 * in) and what happens if you ignore it (nothing).
 */
export function sendMergeOtpEmail(email: string, code: string): Promise<void> {
  return send(
    email,
    `${code} es tu código para fusionar cuentas de kura`,
    `Desde otra cuenta de kura pidieron fusionar la cuenta de este correo con la suya. ` +
      `Si fuiste tú, tu código es ${code}. Expira en 10 minutos. No compartas este código con nadie.\n\n` +
      `Al fusionar, tus colecciones, títulos, reseñas y seguidores pasan a la otra cuenta ` +
      `y esta cuenta deja de existir. Si no fuiste tú, ignora este correo: sin el código ` +
      `no se puede fusionar nada.`,
    "MERGE-OTP",
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
 * so the only way to stop the notice isn't deleting the title you waited for
 * (album, film or series — the copy follows `format`).
 */
export function sendReleaseEmail(
  email: string,
  title: {
    /** Drives the copy: an album is heard, a film or series is watched.
     *  Typed off the DB enum so a new media type reaches `releaseCopyFor`'s
     *  exhaustiveness check instead of a hand-kept union. */
    format: ReleaseFormat;
    title: string;
    byline: string | null;
    itemUrl: string;
    addedOn: string | null;
    waitedDays: number | null;
  },
): Promise<void> {
  const { pronoun, cta } = releaseCopyFor(title.format, title.byline);
  const waited =
    title.addedOn && title.waitedDays != null && title.waitedDays > 0
      ? `${pronoun} guardaste en una colección el ${title.addedOn}, cuando faltaban ${title.waitedDays} días. La espera terminó.\n\n`
      : "";
  const body =
    `${releaseFirstLine(title)}\n\n` +
    waited +
    `${cta}: ${title.itemUrl}\n\n` +
    `Te avisamos porque estaba en tu no puedo esperar. Si no quieres estos avisos, ` +
    `apágalos en ${SITE_URL}/settings`;
  return send(email, releaseSubject(title.title), body, "RELEASE");
}

/**
 * The release email's first line ("Hoy sale X, de Y."), shared with the
 * release push (`api/cron/release`), so the phone and the inbox say the
 * same thing.
 */
export function releaseFirstLine(title: {
  format: ReleaseFormat;
  title: string;
  byline: string | null;
}): string {
  const { artist } = releaseCopyFor(title.format, title.byline);
  return `Hoy sale ${title.title}${artist}.`;
}

/** The release email's subject, also the release push's title. */
export function releaseSubject(title: string): string {
  return `Ya salió ${title}`;
}

/** Library formats only: a party song (`track`) never has an owner to mail. */
type ReleaseFormat = MediaType;

/**
 * The per-format words of the release email. A `switch` with a `never` arm on
 * purpose: a new media type must fail `tsc` here, not silently get the film
 * copy ("Mira dónde verla" for, say, a book).
 */
function releaseCopyFor(
  format: ReleaseFormat,
  byline: string | null,
): { artist: string; pronoun: string; cta: string } {
  switch (format) {
    case "album":
      // The artist says who ("el álbum" → lo).
      return {
        artist: byline ? `, de ${byline}` : "",
        pronoun: "Lo",
        cta: "Escúchalo",
      };
    case "film":
    case "series":
      // A film/series byline is the studio or network, which reads like a
      // credit roll in a one-line email — so no byline. "la película" /
      // "la serie" → la.
      return { artist: "", pronoun: "La", cta: "Mira dónde verla" };
    default: {
      const unhandled: never = format;
      throw new Error(`sendReleaseEmail: no copy for format ${String(unhandled)}`);
    }
  }
}

/**
 * F3.3 — monthly recap notification. `totalItems` = every title with
 * activity that month (the card's "N TÍTULOS"), `completedCount` = the
 * completed ones, named as the recap names them: "títulos" and "completos" —
 * never "obsesiones", which is a different, smaller count.
 */
export function sendRecapEmail(
  email: string,
  recap: { eraKey: string; label: string; totalItems: number; completedCount: number },
): Promise<void> {
  const month = monthName(recap.eraKey);
  const titles = `${recap.totalItems} ${recap.totalItems === 1 ? "título" : "títulos"}`;
  const done = `${recap.completedCount} ${recap.completedCount === 1 ? "completo" : "completos"}`;
  // Recap has no permanent nav tab (it's a monthly moment) — this link is its
  // in-app entry point, so the ritual stays reachable without a constant tab.
  const body = `Tu ${month}: ${titles}, ${done}. Tu tarjeta del mes: ${SITE_URL}/recap`;
  return send(email, `tu ${recap.label} está listo.`, body, "RECAP");
}
