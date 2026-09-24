import { z } from "zod";
import { withApi } from "@/authz/api";
import { json, readQuery } from "@/app/api/v1/_lib/http";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import { searchProfiles } from "@/modules/social/queries";

/**
 * GET /api/v1/people/search?q= → { items: [Person] } (F3.10.2 Buscar gente).
 * The needle cap is the action's (60 chars → 400 `invalid`); everything else
 * — the 2-char minimum, the @-strip, the accent fold, the 20-row cap, the
 * public-only gate — is `searchProfiles`' call. Under the minimum the
 * module answers [] and so do we, as a 200.
 */
const QuerySchema = z.object({ q: z.string().max(60).default("") });

export const GET = withApi(async (req, { user }) => {
  const { q } = readQuery(req, QuerySchema);
  const rows = await searchProfiles(user.id, q);
  return json({
    items: rows.map((r) =>
      toPersonLite({
        username: r.username,
        name: r.name,
        avatarUrl: r.avatarUrl,
        avatarHexes: r.avatarHexes,
        isFounder: r.isFounder,
        following: r.following,
      }),
    ),
  });
});
