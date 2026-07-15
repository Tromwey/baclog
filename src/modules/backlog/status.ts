/**
 * Canonical Spanish labels for `item_status` (db/schema.ts itemStatusEnum).
 * Single source of truth for the in-app progress gesture and the public
 * backlog page — the public page briefly drifted to English copy because
 * this map lived only in progress-gesture.tsx (audit fix, 2026-07-14).
 */
export const STATUS_LABEL: Record<string, string> = {
  on_my_radar: "En el radar",
  in_progress: "En progreso",
  completed: "Completado",
};
