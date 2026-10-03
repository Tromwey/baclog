/**
 * "Llévala a otra app" — copy the web shows around the TIDAL connection
 * (contract `state/export-contract.md` §4.1.4). Shared by /c/{id} and
 * Ajustes › música (both are valid `return` targets of the OAuth dance).
 */

const TIDAL_CONNECT_FAILED: Record<string, string> = {
  denied: "No diste permiso en TIDAL.",
  session: "Abre el link en el mismo navegador donde entraste a kura.",
  expired: "La conexión con TIDAL caducó. Vuelve a intentarlo.",
  exchange: "La conexión con TIDAL caducó. Vuelve a intentarlo.",
  unavailable: "TIDAL todavía no está disponible en kura.",
  rate_limited: "Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.",
};

/** The toast after `?music=tidal&connected=0&reason=…`. */
export function tidalConnectFailed(reason: string | null | undefined): string {
  return (reason && TIDAL_CONNECT_FAILED[reason]) || "No pudimos conectar TIDAL. Vuelve a intentarlo.";
}

/** What the landing query says, or null when it isn't a TIDAL return. */
export type TidalReturn = { ok: true } | { ok: false; reason: string | null };

export function parseTidalReturn(sp: Record<string, string | string[] | undefined>): TidalReturn | null {
  if (sp.music !== "tidal") return null;
  if (sp.connected === "1") return { ok: true };
  return { ok: false, reason: typeof sp.reason === "string" ? sp.reason : null };
}
