/**
 * Pick the singular or plural word for a count. Spanish (like English)
 * pluralizes everything except exactly one — so 0 takes the plural form.
 * Only the word is returned; callers own the number, padding, and casing.
 *
 *   plural(1, "título", "títulos") // "título"
 *   plural(0, "título", "títulos") // "títulos"
 */
export function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
