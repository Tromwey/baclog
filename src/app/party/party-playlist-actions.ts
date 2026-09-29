"use server";

import { PartyUnavailableError } from "@/modules/party-collections/errors";
import { getPartySummaryByToken } from "@/modules/party-collections/queries";
import { invitePath, parseInviteToken, presenceLine } from "@/modules/party-collections/rules";

/**
 * /party → "Arma la playlist de la fiesta en kura" (fiesta-app-v2 · isParty).
 * ANONYMOUS on purpose (the invitation has no session): it reads the party
 * behind the configured invite token through `getPartySummaryByToken` — a
 * whitelist (name, counts, ≤ 2 public handles, ≤ 5 artwork URLs) keyed by an
 * ACTIVE token, so a revoked link answers null and the card hides itself.
 *
 * The token is configuration, not code: env `PARTY_PLAYLIST_TOKEN` (the 16
 * characters after `/f/` in the host's "invita a la fiesta." link). Unset,
 * malformed, revoked, or migration 0033 not live → null.
 */
export async function getPartyPlaylistAction(): Promise<{
  href: string;
  line: string;
  artworkUrls: string[];
} | null> {
  const token = parseInviteToken(process.env.PARTY_PLAYLIST_TOKEN?.trim());
  if (!token) return null;
  try {
    const s = await getPartySummaryByToken(token);
    if (!s) return null;
    return { href: invitePath(token), line: presenceLine(s), artworkUrls: s.artworkUrls };
  } catch (err) {
    if (err instanceof PartyUnavailableError) return null;
    throw err;
  }
}
