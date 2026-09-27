import "server-only";
import { ApiError } from "@/authz/api";
import { toPersonLite } from "@/app/api/v1/_lib/wire";
import type { PeopleListPage } from "@/app/api/v1/_lib/schemas";
import { getFollowListsAccess } from "@/modules/social/follow-lists";
import { getOthersPeoplePage } from "@/modules/social/queries";

/** Copy of the 403 — says whose rule it is, never who is on the list. */
const MUTUALS_MSG = "Solo sus seguidores mutuos pueden ver esta lista.";
const PRIVATE_MSG = "Esta persona mantiene privada esta lista.";

/**
 * `GET /people/{handle}/followers` · `GET /people/{handle}/following`
 * (2026-09-27: the lists became an owner setting, follow-lists-policy.ts).
 * Gates, in this order, BEFORE the list query:
 *
 *   1. owner is a public profile with a handle, and no block in EITHER
 *      direction with the caller — else the SAME 404 (default copy) as
 *      `GET /people/{handle}` for a private, nonexistent or malformed handle
 *      (learnings/2026-09-24-404-identico-con-mensaje-distinto-es-oraculo);
 *   2. the visibility rule for this caller — else 403 `forbidden`, reason
 *      `lists_private`, `visibility` = the owner's setting (already public on
 *      their `Person`, so the 403 reveals nothing new).
 *
 * The list itself (`getOthersPeoplePage`) re-gates every listed person
 * INSIDE its query (`publicAuthor` + `notBlockedWith(caller, …)`); the rest
 * is `anonymousCount`. The owner reading their own through this route gets
 * the same public-safe page (their full list is `GET /me/followers|following`).
 */
export async function buildOthersPeoplePage(
  viewerId: string,
  handle: string,
  mode: "followers" | "following",
  cursor: string | null,
): Promise<PeopleListPage> {
  const access = await getFollowListsAccess(viewerId, handle);
  if (!access || access.blocked) throw new ApiError("not_found");
  if (!access.allowed) {
    // `public` never lands here (allowed unless blocked, which 404'd above).
    throw new ApiError("forbidden", access.visibility === "mutuals" ? MUTUALS_MSG : PRIVATE_MSG, {
      reason: "lists_private",
      visibility: access.visibility,
    });
  }

  const page = await getOthersPeoplePage(viewerId, access.ownerId, mode, cursor);
  return {
    items: page.people.map((p) =>
      toPersonLite({
        username: p.username,
        name: p.name,
        avatarUrl: p.avatarUrl,
        avatarHexes: p.avatarHexes,
        isFounder: p.isFounder,
        following: p.following,
      }),
    ),
    anonymousCount: page.privateCount,
    nextCursor: page.nextCursor,
  };
}
