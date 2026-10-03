"use server";

import { getPartySummaryByToken } from "@/modules/party-collections/queries";
import { invitePath, parseInviteToken, playlistPitch, presenceLine } from "@/modules/party-collections/rules";

/**
 * /party → "Arma la playlist de la fiesta en kura" (fiesta-app-v2 · isParty).
 * ANONYMOUS on purpose (the invitation has no session): it reads the party
 * behind the configured invite token through `getPartySummaryByToken` — a
 * whitelist (name, counts, ≤ 2 public handles, ≤ 5 artwork URLs) keyed by an
 * ACTIVE token, so a revoked link answers null and the card hides itself.
 *
 * The token is configuration, not code: env `PARTY_PLAYLIST_TOKEN` (the 16
 * characters after `/f/` in the host's "invita a la fiesta." link). Unset,
 * malformed or revoked → null (each logged: a card
 * that silently never shows is how a typo in the env goes unnoticed).
 *
 * Security (accepted, state/security.md): this hands the ACTIVE invite link
 * to anyone who opens /party — it IS the invitation. To take it back, rotate
 * the party's link and redeploy with the new `PARTY_PLAYLIST_TOKEN`.
 */
export async function getPartyPlaylistAction(): Promise<{
  href: string;
  line: string;
  pitch: string;
  artworkUrls: string[];
} | null> {
  const raw = process.env.PARTY_PLAYLIST_TOKEN?.trim();
  if (!raw) return null;
  const token = parseInviteToken(raw);
  if (!token) {
    console.warn("[party] PARTY_PLAYLIST_TOKEN is set but malformed (want the 16 chars after /f/)");
    return null;
  }
  const s = await getPartySummaryByToken(token);
  if (!s) {
    console.warn("[party] PARTY_PLAYLIST_TOKEN does not open a party (revoked, rotated or unknown)");
    return null;
  }
  return {
    href: invitePath(token),
    line: presenceLine(s),
    pitch: playlistPitch(s.perGuestLimit),
    artworkUrls: s.artworkUrls,
  };
}
