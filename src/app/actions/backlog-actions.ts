"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnsBacklog, assertUser } from "@/authz";
import { db } from "@/db";
import { backlogs } from "@/db/schema";

const nameSchema = z.string().trim().min(1).max(60);
const vibeSchema = z.string().trim().max(80).optional();

export async function createBacklogAction(input: {
  name: string;
  vibe?: string;
}) {
  const user = await assertUser();
  const name = nameSchema.safeParse(input.name);
  const vibe = vibeSchema.safeParse(input.vibe);
  if (!name.success || !vibe.success) return { error: "invalid" as const };

  const [created] = await db
    .insert(backlogs)
    .values({ userId: user.id, name: name.data, vibe: vibe.data || null })
    .returning({ id: backlogs.id });
  revalidatePath("/backlogs");
  return { id: created.id };
}

export async function renameBacklogAction(backlogId: string, name: string) {
  const { backlog } = await assertOwnsBacklog(backlogId);
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: "invalid" as const };
  await db
    .update(backlogs)
    .set({ name: parsed.data, updatedAt: new Date() })
    .where(eq(backlogs.id, backlog.id));
  revalidatePath(`/backlogs/${backlog.id}`);
  revalidatePath("/backlogs");
  return { ok: true as const };
}

/** The three states of F3.10.1, and how they land on the two boolean axes. */
const VISIBILITY = {
  private: { isPublic: false, showOnProfile: false },
  public: { isPublic: true, showOnProfile: false },
  featured: { isPublic: true, showOnProfile: true },
} as const;

export type BacklogVisibility = keyof typeof VISIBILITY;

/**
 * F3.10.1 — Privado / Público / En tu perfil, set from the profile's edit
 * sheet. One action for the whole triad so the two columns can never be
 * written inconsistently (featured always implies public). Revalidates the
 * public tree too: making a backlog private must 404 its /u URL immediately.
 */
export async function setBacklogVisibilityAction(
  backlogId: string,
  visibility: BacklogVisibility,
) {
  const { user, backlog } = await assertOwnsBacklog(backlogId);
  const parsed = z.enum(["private", "public", "featured"]).safeParse(visibility);
  if (!parsed.success) return { error: "invalid" as const };

  await db
    .update(backlogs)
    .set({ ...VISIBILITY[parsed.data], updatedAt: new Date() })
    .where(eq(backlogs.id, backlog.id));

  revalidatePath("/perfil");
  revalidatePath("/feed");
  if (user.username) revalidatePath(`/u/${user.username}`, "layout");
  return { ok: true as const };
}

export async function deleteBacklogAction(backlogId: string) {
  const { backlog } = await assertOwnsBacklog(backlogId);
  await db.delete(backlogs).where(eq(backlogs.id, backlog.id));
  revalidatePath("/backlogs");
  redirect("/backlogs");
}
