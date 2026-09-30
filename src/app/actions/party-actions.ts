"use server";

import { z } from "zod";
import { PARTY_DIETS, PARTY_DRINKS } from "@/modules/party/event";
import { countSacrifices, isCostumeTaken, saveRsvp } from "@/modules/party/rsvp";

/*
 * The /party invitation's writes. Anonymous by design (guests don't sign in):
 * the guest is the random token the page keeps in localStorage. Everything is
 * bounded here — lengths, the diet/drink whitelists — and the row count is
 * capped in saveRsvp.
 */

const token = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);

const rsvpSchema = z.object({
  guestToken: token,
  name: z.string().trim().min(1).max(80),
  attending: z.boolean(),
  plusOne: z.boolean(),
  plusName: z.string().trim().max(80),
  diets: z.array(z.enum(PARTY_DIETS)).max(PARTY_DIETS.length),
  drink: z.union([z.enum(PARTY_DRINKS), z.literal("")]),
  costume: z.string().trim().max(80),
});

export async function submitPartyRsvpAction(input: unknown) {
  const parsed = rsvpSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" as const };
  const res = await saveRsvp({ ...parsed.data, diets: [...new Set(parsed.data.diets)] });
  if (res === "full") return { error: "full" as const };
  return { ok: true as const };
}

export async function checkPartyCostumeAction(costume: unknown, guestToken: unknown) {
  const c = z.string().max(80).safeParse(costume);
  const t = token.safeParse(guestToken);
  if (!c.success || !t.success) return false;
  return isCostumeTaken(c.data, t.data);
}

/** The crypt's sacrifice count: how many people are going, party-wide (a number, no identities). */
export async function getPartySacrificesAction(): Promise<number> {
  return countSacrifices();
}
