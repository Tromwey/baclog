"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertUser } from "@/authz";
import { preferredServiceSchema, updateProfile } from "@/modules/account/profile";
import { completePicks, picksSchema } from "@/modules/backlog/picks";

/**
 * Onboarding step 2 — "Elige tres" (Revamp UI, 2026-09-03). The rule (first
 * backlog "Obsesiones" or the newest existing one, picks become obsessions,
 * F3.8 pre-order backfill, re-entry never duplicates) lives in
 * `modules/backlog/picks.ts`, shared with `POST /me/onboarding/picks`.
 */
export async function completePicksAction(
  picks: { catalogItemId: string; paletteHex?: string[] }[],
) {
  const user = await assertUser();
  const parsed = picksSchema.safeParse(picks);
  if (!parsed.success) return { error: "invalid" as const };

  const { backlogId } = await completePicks(user.id, parsed.data);

  // "layout" over /backlogs: the shelf list, both zoom twins and the lenses.
  revalidatePath("/backlogs", "layout");
  return { ok: true as const, backlogId };
}

/**
 * Onboarding's terminal step (3 · servicio preferido, v2 2026-09-03): saves
 * the music service every album will open in, then finishes. Server-side
 * redirect on purpose — a client router.push here can replay the stale
 * "/backlogs → /onboarding" redirect cached before onboarding completed. The
 * (app) layout re-gates on `user.name`, so an account that never finished
 * step 1 simply lands back here. The SAME write path as Ajustes'
 * `setPreferredServiceAction` and `PATCH /me` (`modules/account/profile.ts`):
 * the user comes from the session, the service from the enum.
 */
export async function chooseServiceAndFinishAction(service: string) {
  const user = await assertUser();
  const parsed = preferredServiceSchema.safeParse(service);
  if (!parsed.success) return { error: "invalid" as const };
  await updateProfile(user.id, { preferredService: parsed.data });
  redirect("/backlogs");
}
