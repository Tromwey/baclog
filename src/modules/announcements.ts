/**
 * Feature announcements — the one-line-per-release mechanism.
 *
 * ONE key lives here. To announce the next feature you change
 * CURRENT_ANNOUNCEMENT (and its copy below); every account's stored
 * `users.announcement_seen` stops matching and everyone becomes eligible
 * again. No UPDATE, no cleanup, no migration per release — the same shape as
 * CURRENT_PROMPT_VERSION / NARRATE_PROMPT_VERSION in the recs module.
 *
 * ⚠️ The constant IS the release trigger. Bumping it publishes instantly to
 * every eligible account, and there is no un-seeing it — so change it in the
 * deploy that carries the finished copy, never ahead of it.
 *
 * THE RULE FOR WHAT GOES HERE: announce only what a user cannot discover by
 * using the app normally. A change they'll meet by opening a screen they
 * already open does not need a strip; it needs to be good. This mechanism is
 * cheap enough to overuse, which is the only real way it can fail.
 */

import { releaseDayLong } from "@/modules/catalog/release";

export const CURRENT_ANNOUNCEMENT = "f3.8-no-puedo-esperar";

/**
 * When the announced feature shipped. Accounts created AFTER this never see
 * the strip: to them the feature isn't new, and interrupting someone's first
 * session to celebrate something they never lived without is noise.
 *
 * Deriving eligibility from `users.created_at` (rather than stamping the key
 * at signup) means no write on the signup path and no way for a new account
 * creation route to be missed — same posture as the derived onboarding step.
 */
export const ANNOUNCED_AT = new Date("2026-08-02T00:00:00.000Z");

/** Fixed chrome for the Novedades sheet. */
export const ANNOUNCEMENT_COPY = {
  eyebrow: "Nuevo en Baclog",
  title: "No puedo esperar",
  close: "Entendido",
} as const;

const NUMBER_WORD = [
  "",
  "Un",
  "Dos",
  "Tres",
  "Cuatro",
  "Cinco",
  "Seis",
  "Siete",
  "Ocho",
  "Nueve",
];

/** "Tres" for 3, "12" past the spelled-out range. Design writes words. */
function spell(n: number): string {
  return NUMBER_WORD[n] ?? String(n);
}

/** "hoy" / "mañana" / "en 12 días" — the release as a phrase in a sentence. */
export function releasePhrase(releaseDate: Date | string, now: number): string {
  const ms = new Date(releaseDate).getTime() - now;
  if (ms <= 0) return "ya salió";
  const days = Math.ceil(ms / 86_400_000);
  if (ms <= 86_400_000) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/**
 * Novedades 6c — the reader already owns unreleased titles, so there is nothing
 * to offer: the copy just tells them what their own backlog is now doing.
 */
export function ownCopy(
  count: number,
  nearest: { byline: string | null; releaseDate: Date | string },
  now: number,
): string {
  const when = releasePhrase(nearest.releaseDate, now);
  const whose = nearest.byline ? `el de ${nearest.byline}` : "el más cercano";
  if (count === 1) {
    return `Un título de tu backlog todavía no salió. Ahora cuenta lo que falta, y sale ${when}: te avisamos.`;
  }
  return `${spell(count)} títulos de tu backlog todavía no salieron. Ahora cuentan lo que falta, y ${whose} sale ${when}: te avisamos.`;
}

/** Novedades 6b — nothing of theirs is pending, so we demonstrate on one. */
export function suggestionCopy(artist: string | null): string {
  const whose = artist ? `el de ${artist}` : "este";
  return `Ahora Baclog cuenta los días de lo que todavía no salió y te avisa el día del lanzamiento. Sigue ${whose} para verlo funcionando.`;
}

/** Novedades 6b, after the tap — the reward, before they close. */
export function followedCopy(releaseDate: Date | string, now: number): string {
  const when = releasePhrase(releaseDate, now);
  const day =
    when === "hoy" || when === "mañana"
      ? when
      : `el ${releaseDayLong(releaseDate)}`;
  return `Listo: te avisamos ${day}. Ya está contando arriba de tu backlog.`;
}

/**
 * Is this account eligible for the current announcement?
 * Pure — takes the two user fields it needs so callers can decide from a row
 * they already loaded, with no extra query.
 */
export function shouldAnnounce(user: {
  announcementSeen: string | null;
  createdAt: Date;
}): boolean {
  if (user.announcementSeen === CURRENT_ANNOUNCEMENT) return false;
  return user.createdAt < ANNOUNCED_AT;
}
