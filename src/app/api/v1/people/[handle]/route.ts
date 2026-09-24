import { withApi } from "@/authz/api";
import { json } from "@/app/api/v1/_lib/http";
import { buildPerson, parseHandle } from "../_lib/person";

/**
 * GET /api/v1/people/{handle} → Person (§4 Gente y feed).
 * Private and nonexistent handles (and malformed ones) are one identical 404.
 */
export const GET = withApi<{ handle: string }>(async (_req, { user, params }) => {
  const handle = parseHandle(params.handle);
  return json(await buildPerson(user, handle));
});
