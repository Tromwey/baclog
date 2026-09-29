"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { assertUser } from "@/authz";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { PartyUnavailableError } from "@/modules/party-collections/errors";
import { getPartyDetail, listPartiesForUser } from "@/modules/party-collections/queries";
import {
  duplicateMessage,
  GUEST_REF_RE,
  invitePath,
  parseInviteToken,
  partyNameSchema,
  partyPath,
  perGuestLimitSchema,
} from "@/modules/party-collections/rules";
import { searchPartySongs } from "@/modules/party-collections/search";
import {
  addSong,
  createParty,
  deleteParty,
  joinParty,
  removeSong,
  removeSongAndBlockAuthor,
  revokeInvite,
  rotateInvite,
  unblockGuest,
  updateParty,
} from "@/modules/party-collections/write";

/**
 * Colecciones de fiesta — the web's server actions. Thin wrappers (AGENTS.md
 * / state/backend.md): session user → `modules/party-collections` with that
 * explicit id → revalidate. Every rule lives in the module (the API v1 reuses
 * it). No `export type` here (learning 2026-09-27-export-type-en-use-server).
 *
 * Every action answers a discriminated object, never throws for an expected
 * outcome: `{ error: "unavailable" }` while migration 0033 isn't live,
 * `{ error: "not_found" }` for a party the caller can't see (no oracle).
 * Signed-out callers: `assertUser` throws (like every other action), except
 * `joinPartyAction`, which answers `signin_required` with the login path.
 */

const idSchema = z.string().min(1).max(64);
const titleIdSchema = z.string().min(1).max(64);

function revalidateParty(backlogId: string) {
  revalidatePath(partyPath(backlogId));
  revalidatePath("/backlogs", "layout");
}

async function guarded<T>(run: () => Promise<T>): Promise<T | { error: "unavailable" }> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof PartyUnavailableError) return { error: "unavailable" as const };
    throw err;
  }
}

// ---------- reads for client refresh ----------

/** The member view again (after a write elsewhere, or polling "en vivo"). */
export async function getPartyAction(backlogId: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "not_found" as const };
  return guarded(async () => {
    const party = await getPartyDetail(user.id, id.data);
    return party ? { ok: true as const, party } : { error: "not_found" as const };
  });
}

/** "Tus colecciones · De fiesta": parties the user hosts or joined. */
export async function listMyPartiesAction() {
  const user = await assertUser();
  return guarded(async () => ({ ok: true as const, parties: await listPartiesForUser(user.id) }));
}

// ---------- host ----------

export async function createPartyAction(input: { name: string; perGuestLimit?: number | null }) {
  const user = await assertUser();
  const parsed = z
    .object({ name: partyNameSchema, perGuestLimit: perGuestLimitSchema.optional() })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  return guarded(async () => {
    const { backlogId, invite } = await createParty(user.id, parsed.data);
    revalidatePath("/backlogs", "layout");
    return { ok: true as const, id: backlogId, path: partyPath(backlogId), invite };
  });
}

export async function updatePartyAction(
  backlogId: string,
  input: { name?: string; perGuestLimit?: number | null },
) {
  const user = await assertUser();
  const parsed = z
    .object({
      id: idSchema,
      name: partyNameSchema.optional(),
      perGuestLimit: perGuestLimitSchema.optional(),
    })
    .safeParse({ id: backlogId, ...input });
  if (!parsed.success) return { error: "invalid" as const };
  return guarded(async () => {
    const ok = await updateParty(user.id, parsed.data.id, {
      name: parsed.data.name,
      perGuestLimit: parsed.data.perGuestLimit,
    });
    if (!ok) return { error: "not_found" as const };
    revalidateParty(parsed.data.id);
    return { ok: true as const };
  });
}

export async function deletePartyAction(backlogId: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "not_found" as const };
  return guarded(async () => {
    if (!(await deleteParty(user.id, id.data))) return { error: "not_found" as const };
    revalidatePath("/backlogs", "layout");
    return { ok: true as const };
  });
}

/** "Crear link nuevo" — the previous link stops working at once. */
export async function rotatePartyInviteAction(backlogId: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "not_found" as const };
  return guarded(async () => {
    const invite = await rotateInvite(user.id, id.data);
    if (!invite) return { error: "not_found" as const };
    revalidateParty(id.data);
    return { ok: true as const, invite };
  });
}

/** "Desactivar link" — nobody else can enter; members stay. */
export async function revokePartyInviteAction(backlogId: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "not_found" as const };
  return guarded(async () => {
    if (!(await revokeInvite(user.id, id.data))) return { error: "not_found" as const };
    revalidateParty(id.data);
    return { ok: true as const };
  });
}

/** "Quitar y bloquear a @x" — by the SONG (titleId); its author is blocked. */
export async function removeAndBlockPartyGuestAction(backlogId: string, titleId: string) {
  const user = await assertUser();
  const ids = z.tuple([idSchema, titleIdSchema]).safeParse([backlogId, titleId]);
  if (!ids.success) return { error: "not_found" as const };
  return guarded(async () => {
    const res = await removeSongAndBlockAuthor(user.id, ids.data[0], ids.data[1]);
    if (!res.ok) return { error: res.error };
    revalidateParty(ids.data[0]);
    const party = await getPartyDetail(user.id, ids.data[0]);
    return party ? { ok: true as const, party } : { error: "not_found" as const };
  });
}

/** "Desbloquear" — `guestRef` comes from `party.blockedGuests`. */
export async function unblockPartyGuestAction(backlogId: string, guestRef: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success || !GUEST_REF_RE.test(guestRef)) return { error: "not_found" as const };
  return guarded(async () => {
    if (!(await unblockGuest(user.id, id.data, guestRef))) return { error: "not_found" as const };
    revalidateParty(id.data);
    return { ok: true as const };
  });
}

// ---------- guests (and the host) ----------

/**
 * Enter the party with the invite link (/f/{token} → "Entrar"). Signed out →
 * `signin_required` + `loginPath` (`/login?to=/f/{token}`); not onboarded →
 * `onboarding_required` + `onboardingPath` (`/onboarding?to=/f/{token}`).
 * Success → `path` = the member page (`/c/{id}`); `joined` says whether the
 * welcome sheet is "ya estás dentro." (new) or a returning member / the host.
 */
export async function joinPartyAction(token: string) {
  const back = parseInviteToken(token) ? invitePath(token) : null;
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: "signin_required" as const,
      loginPath: back ? `/login?to=${encodeURIComponent(back)}` : "/login",
    };
  }
  return guarded(async () => {
    const res = await joinParty(user.id, token);
    if (!res.ok) {
      if (res.error === "onboarding_required") {
        return {
          error: res.error,
          onboardingPath: back ? `/onboarding?to=${encodeURIComponent(back)}` : "/onboarding",
        };
      }
      return { error: res.error };
    }
    revalidateParty(res.backlogId);
    return {
      ok: true as const,
      id: res.backlogId,
      path: partyPath(res.backlogId),
      joined: res.joined,
      blocked: res.blocked,
    };
  });
}

/** "Buscar canción" — iTunes songs annotated against this party. */
export async function searchPartySongsAction(backlogId: string, query: string) {
  const user = await assertUser();
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "not_found" as const };
  return guarded(async () => {
    const res = await searchPartySongs(user.id, id.data, query);
    return res.ok ? { ok: true as const, items: res.items } : res;
  });
}

/**
 * "Agregar". Refusals carry `message` (the design's copy) so the UI can toast
 * it as-is: duplicate → "Ya está, la puso @ana" / "Ya la pusiste tú.";
 * `cap_reached` → open the "ya pusiste tus N" sheet; `blocked` / `view_only`
 * → the blocked / solo-ver notice. Success returns the fresh party.
 */
export async function addPartySongAction(backlogId: string, titleId: string, paletteHex?: string[]) {
  const user = await assertUser();
  const ids = z.tuple([idSchema, titleIdSchema]).safeParse([backlogId, titleId]);
  if (!ids.success) return { error: "not_found" as const };
  const palette = paletteHexSchema.optional().safeParse(paletteHex);
  return guarded(async () => {
    const res = await addSong(user.id, ids.data[0], ids.data[1], palette.success ? palette.data : null);
    if (!res.ok) {
      if (res.error === "duplicate_mine" || res.error === "duplicate_other") {
        return {
          error: res.error,
          addedBy: res.addedBy,
          message: duplicateMessage(res.error === "duplicate_mine", res.addedBy?.handle ?? null),
        };
      }
      return "addedBy" in res ? { error: res.error, addedBy: res.addedBy } : { error: res.error };
    }
    revalidateParty(ids.data[0]);
    const party = await getPartyDetail(user.id, ids.data[0]);
    return party ? { ok: true as const, party } : { error: "not_found" as const };
  });
}

/** "Quitar" — host: any song · guest: own songs, not while blocked. */
export async function removePartySongAction(backlogId: string, titleId: string) {
  const user = await assertUser();
  const ids = z.tuple([idSchema, titleIdSchema]).safeParse([backlogId, titleId]);
  if (!ids.success) return { error: "not_found" as const };
  return guarded(async () => {
    const res = await removeSong(user.id, ids.data[0], ids.data[1]);
    if (!res.ok) return { error: res.error };
    revalidateParty(ids.data[0]);
    const party = await getPartyDetail(user.id, ids.data[0]);
    return party ? { ok: true as const, party } : { error: "not_found" as const };
  });
}
