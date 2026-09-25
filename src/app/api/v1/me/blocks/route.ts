import { withApi } from "@/authz/api";
import { listBlocked } from "@/modules/social/block";
import { json } from "../../_lib/http";
import type { BlockedPerson } from "../../_lib/schemas";

/**
 * GET /api/v1/me/blocks → { items: BlockedPerson[] } (App Store 1.2), newest
 * first, unpaginated (a block list is short). The caller's OWN list — nobody
 * else's is reachable. `handle`, a real `name` and `avatarUrl` only while the
 * blocked account is still a public profile with a handle; otherwise
 * `{ id, handle: null, name: "Perfil privado", avatarUrl: null }`, and `id`
 * (opaque) is what `DELETE /me/blocks/{id}` takes to unblock it.
 */
export const GET = withApi(async (_request, { user }) => {
  const items: BlockedPerson[] = await listBlocked(user.id);
  return json({ items });
});
