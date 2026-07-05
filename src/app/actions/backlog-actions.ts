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

export async function deleteBacklogAction(backlogId: string) {
  const { backlog } = await assertOwnsBacklog(backlogId);
  await db.delete(backlogs).where(eq(backlogs.id, backlog.id));
  revalidatePath("/backlogs");
  redirect("/backlogs");
}
