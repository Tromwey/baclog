import { MIGRATION_0034_LIVE } from "./live";
import { serviceLabel, SERVICE_FAILED_MESSAGE } from "./rules";
import type { MusicProvider } from "./types";

/**
 * Every EXPECTED failure of the music export, as one throwable family that
 * carries its own API mapping (`code` + `reason`): `authz/api.ts`
 * `errorToResponse` turns it into the §1 envelope, the web actions into
 * `{ error: reason }`. No `server-only` (scripts import the rules).
 *
 * Never put a token, a code or an upstream body in `message` — it goes to
 * the client verbatim.
 */
export type MusicExportErrorCode = "unavailable" | "conflict" | "rate_limited" | "not_found";

export class MusicExportError extends Error {
  readonly code: MusicExportErrorCode;
  readonly reason: string;
  readonly retryAfterSeconds?: number;
  constructor(code: MusicExportErrorCode, reason: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "MusicExportError";
    this.code = code;
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Migration 0034 not applied yet → 503 `unavailable` (reason `migration`). */
export function assertMusicExportLive(): void {
  if (!MIGRATION_0034_LIVE) {
    throw new MusicExportError(
      "unavailable",
      "migration",
      "Exportar a otras apps todavía no está disponible. Inténtalo más tarde.",
    );
  }
}

/** The service isn't configured on this deploy (missing env) → "Próximamente". */
export function notConfigured(provider: MusicProvider): MusicExportError {
  return new MusicExportError(
    "unavailable",
    "not_configured",
    `${serviceLabel(provider)} todavía no está disponible en kura.`,
  );
}

/** No (usable) TIDAL link for this user → the UI shows "Conectar TIDAL". */
export function notConnected(provider: MusicProvider): MusicExportError {
  return new MusicExportError(
    "conflict",
    "not_connected",
    `Conecta tu cuenta de ${serviceLabel(provider)} para pasar la colección.`,
  );
}

/** The service failed mid-way (5xx, timeout, bad JSON). Progress is kept. */
export function serviceFailed(provider: MusicProvider): MusicExportError {
  return new MusicExportError("unavailable", "service_failed", SERVICE_FAILED_MESSAGE(provider));
}

/** The service said 429: wait and call the same step again. */
export function serviceRateLimited(provider: MusicProvider, retryAfterSeconds: number): MusicExportError {
  return new MusicExportError(
    "rate_limited",
    "service_rate_limited",
    `${serviceLabel(provider)} pidió una pausa. Seguimos en unos segundos.`,
    Math.max(1, Math.min(120, Math.ceil(retryAfterSeconds))),
  );
}

/** Apple Music report naming a different playlist than the one on record. */
export function playlistExists(provider: MusicProvider): MusicExportError {
  return new MusicExportError(
    "conflict",
    "playlist_exists",
    `Ya hay una playlist de esta fiesta en tu ${serviceLabel(provider)}. Vuelve a cargar y seguimos en esa.`,
  );
}
