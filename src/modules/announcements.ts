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
 * ⚠️ Beta and production share one database. A key bumped on beta is spendable
 * there: whoever dismisses it on beta has it stamped for good and will never
 * see it in production. Ship the pair together, or accept that beta users
 * spend their announcement early.
 *
 * THE RULE FOR WHAT GOES HERE: announce only what a user cannot discover by
 * using the app normally. A change they'll meet by opening a screen they
 * already open does not need a strip; it needs to be good. This mechanism is
 * cheap enough to overuse, which is the only real way it can fail.
 *
 * Reviews qualify under that rule for one reason: the box is INVISIBLE until
 * you react. Someone who never marked a verdict has no way to find out it
 * exists — and someone who did has a row of titles sitting there with nothing
 * written in them.
 */

export const CURRENT_ANNOUNCEMENT = "f3.9-resenas";

/**
 * When the announced feature shipped. Accounts created AFTER this never see
 * the strip: to them the feature isn't new, and interrupting someone's first
 * session to celebrate something they never lived without is noise.
 *
 * Deriving eligibility from `users.created_at` (rather than stamping the key
 * at signup) means no write on the signup path and no way for a new account
 * creation route to be missed — same posture as the derived onboarding step.
 */
export const ANNOUNCED_AT = new Date("2026-08-13T00:00:00.000Z");

/** Fixed chrome for the Novedades sheet. */
export const ANNOUNCEMENT_COPY = {
  eyebrow: "Nuevo en Baclog",
  title: "Reseñas",
  cta: "Escribir la primera",
  close: "Ahora no",
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

/**
 * The body of the F3.9 sheet.
 *
 * It never explains the feature in the abstract — it reads the reader's own
 * library back to them: these are titles YOU already reacted to, and the box
 * on each one is already open. The count is the argument; the cover is the
 * example.
 */
export function invitationCopy(count: number, title: string): string {
  if (count === 1) {
    return `Reaccionaste a ${title} y nunca dijiste por qué. Ahora cabe: 280 caracteres por título, y debajo lo que escribió todo el mundo.`;
  }
  return `${spell(count)} títulos tuyos tienen una reacción y ninguna palabra. Ahora caben: 280 caracteres cada uno, y debajo lo que escribió todo el mundo.`;
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
