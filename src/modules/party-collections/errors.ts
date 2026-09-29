import { MIGRATION_0033_LIVE } from "./live";

/**
 * Thrown by every party entry point while `MIGRATION_0033_LIVE` is false
 * (the tables don't exist yet). The API maps it to 503 `unavailable`, the
 * server actions to `{ error: "unavailable" }`.
 */
export class PartyUnavailableError extends Error {
  constructor() {
    super("Colecciones de fiesta: migration 0033 is not live");
    this.name = "PartyUnavailableError";
  }
}

export function assertPartyLive(): void {
  if (!MIGRATION_0033_LIVE) throw new PartyUnavailableError();
}
