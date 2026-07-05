import type { BacklogItemWithCatalog } from "./queries";

export interface EraGroup {
  /** "2026-07" */
  key: string;
  /** "July era" */
  label: string;
  items: BacklogItemWithCatalog[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * F2.10 — eras are derived at read time (no stored column, no cron, no
 * backfill when the rule changes). Activity = the most recent of addedAt /
 * statusChangedAt: completing something in June counts as June era even if
 * it was added in April. Feeds M3's monthly recap directly.
 */
export function deriveEras(items: BacklogItemWithCatalog[]): EraGroup[] {
  const groups = new Map<string, BacklogItemWithCatalog[]>();
  for (const item of items) {
    const activity =
      item.statusChangedAt > item.addedAt ? item.statusChangedAt : item.addedAt;
    const key = `${activity.getUTCFullYear()}-${String(activity.getUTCMonth() + 1).padStart(2, "0")}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => ({
      key,
      label: `${MONTHS[Number(key.slice(5)) - 1]} era`,
      items: list,
    }));
}
