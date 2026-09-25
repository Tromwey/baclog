import { listMobileSessions } from "@/auth/mobile-sessions";
import { withApi } from "@/authz/api";
import { SESSIONS_UNAVAILABLE, requireMigration0029 } from "../../_lib/devices";
import { json } from "../../_lib/http";
import { isoDate, type MobileSession } from "../../_lib/schemas";

/**
 * GET /api/v1/me/sessions → { items: [MobileSession] } (phase 4d). The
 * caller's live (non-revoked) device sessions, `lastSeenAt desc`; `current`
 * marks the one this bearer belongs to (a pre-4d bearer without `sid` has
 * none — every row reads `current: false`). `deviceName` is the owner's own
 * free text: shown back only here. 503 `unavailable` until migration 0029.
 */
export const GET = withApi(async (_request, { user, bearer }) => {
  requireMigration0029(SESSIONS_UNAVAILABLE);
  const rows = await listMobileSessions(user.id);
  const items: MobileSession[] = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    deviceName: r.deviceName,
    appVersion: r.appVersion,
    createdAt: isoDate(r.createdAt),
    lastSeenAt: isoDate(r.lastSeenAt),
    current: r.id === bearer.claims.sid,
  }));
  return json({ items });
});
