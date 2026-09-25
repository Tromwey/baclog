import "server-only";
import { MIGRATION_0029_LIVE } from "@/auth/live-0029";
import { ApiError } from "@/authz/api";

/** 503 copy while migration 0029 (sessions + device tokens) isn't live. */
export const NOTIFICATIONS_UNAVAILABLE =
  "Las notificaciones todavía no están disponibles. Inténtalo más tarde.";
export const SESSIONS_UNAVAILABLE =
  "La lista de dispositivos todavía no está disponible. Inténtalo más tarde.";

/** Throws 503 `unavailable` with `message` while the 0029 tables may not
 *  exist (`MIGRATION_0029_LIVE`, src/auth/live-0029.ts). */
export function requireMigration0029(message: string): void {
  if (!MIGRATION_0029_LIVE) throw new ApiError("unavailable", message);
}
