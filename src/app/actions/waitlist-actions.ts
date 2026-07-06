"use server";

import { z } from "zod";
import { joinWaitlist } from "@/modules/growth/waitlist";

const schema = z.object({
  email: z.string().email().max(254),
  refCode: z.string().max(12).optional(),
});

export async function joinWaitlistAction(input: {
  email: string;
  refCode?: string;
}) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  const result = await joinWaitlist(parsed.data.email, parsed.data.refCode);
  return { ok: true as const, ...result };
}
