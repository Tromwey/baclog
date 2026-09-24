import { z } from "zod";
import { assertUser } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import {
  backlogNameSchema,
  backlogVibeSchema,
  createBacklog,
  getOwnCollection,
} from "@/modules/backlog/collections";
import { getCollectionsWithMemberships } from "@/modules/backlog/shelves";
import { visibilityFromWire } from "@/modules/backlog/visibility";
import { json, readJson } from "../_lib/http";
import { VisibilitySchema } from "../_lib/schemas";
import { toCollection } from "../_lib/wire";

/**
 * GET /api/v1/collections → { items: [Collection] } (§4 Colecciones).
 * Every backlog of the bearer user, newest first, with the full membership
 * order.
 */
export const GET = withApi(async () => {
  const user = await assertUser();
  const rows = await getCollectionsWithMemberships(user.id);
  return json({ items: rows.map(toCollection) });
});

const CreateBodySchema = z.object({
  name: backlogNameSchema,
  vibe: backlogVibeSchema.nullable().optional(),
  /** Wire `private | link | profile`; the DB default is `profile`. */
  visibility: VisibilitySchema.default("profile"),
});

/**
 * POST /api/v1/collections { name, vibe?, visibility } → 200 Collection
 * (every v1 write answers 200 with the resource, §1 — no 201s).
 * Same validation as `createBacklogAction` (`modules/backlog/collections.ts`
 * is the one write path); the wire visibility is translated to the DB triad
 * here and written as a pair, never as two loose booleans.
 */
export const POST = withApi(async (request, { user }) => {
  const body = await readJson(request, CreateBodySchema);
  const { id } = await createBacklog(user.id, {
    name: body.name,
    vibe: body.vibe ?? null,
    visibility: visibilityFromWire(body.visibility),
  });
  const row = await getOwnCollection(user.id, id);
  if (!row) throw new ApiError("internal");
  return json(toCollection(row));
});
