import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { partyRsvps } from "@/db/schema";
import { PARTY_EVENT, costumeKey } from "./event";

/** Hard ceiling on rows per event: the write is anonymous, so this bounds a flood. */
const MAX_RSVPS = 400;

export type PartyRsvpInput = {
  guestToken: string;
  name: string;
  attending: boolean;
  plusOne: boolean;
  plusName: string;
  diets: string[];
  drink: string;
  costume: string;
};

/** Upsert keyed on (event, guest token): re-submitting edits the same answer. */
export async function saveRsvp(input: PartyRsvpInput): Promise<"ok" | "full"> {
  const slug = PARTY_EVENT.slug;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(partyRsvps)
    .where(eq(partyRsvps.eventSlug, slug));
  const values = {
    name: input.name,
    attending: input.attending,
    // A "no" drops the attending-only details so the host's list stays honest.
    plusOne: input.attending && input.plusOne,
    plusName: input.attending && input.plusOne && input.plusName ? input.plusName : null,
    diets: input.attending ? input.diets : [],
    drink: input.attending && input.drink ? input.drink : null,
    costume: input.attending && input.costume ? input.costume : null,
    updatedAt: new Date(),
  };
  if (n >= MAX_RSVPS) {
    // Full: existing guests can still edit, nobody new gets in.
    const updated = await db
      .update(partyRsvps)
      .set(values)
      .where(and(eq(partyRsvps.eventSlug, slug), eq(partyRsvps.guestToken, input.guestToken)))
      .returning({ id: partyRsvps.id });
    return updated.length ? "ok" : "full";
  }
  await db
    .insert(partyRsvps)
    .values({ eventSlug: slug, guestToken: input.guestToken, ...values })
    .onConflictDoUpdate({
      target: [partyRsvps.eventSlug, partyRsvps.guestToken],
      set: values,
    });
  return "ok";
}

/**
 * Whether another guest already claimed this costume. Exact match on the
 * normalized text, and the answer is a boolean: the costume is a spoiler
 * "solo lo ve el anfitrión", so a guest never learns anyone else's choice
 * beyond the one they typed themselves.
 */
export async function isCostumeTaken(costume: string, guestToken: string): Promise<boolean> {
  const key = costumeKey(costume);
  if (key.length < 3) return false;
  const rows = await db
    .select({ costume: partyRsvps.costume })
    .from(partyRsvps)
    .where(
      and(
        eq(partyRsvps.eventSlug, PARTY_EVENT.slug),
        eq(partyRsvps.attending, true),
        ne(partyRsvps.guestToken, guestToken),
        sql`${partyRsvps.costume} is not null`,
      ),
    );
  return rows.some((r) => r.costume && costumeKey(r.costume) === key);
}

/**
 * The crypt's "sacrifices" (founder, 2026-09-30): every person going — each
 * attending RSVP plus its +1 — counts once, for the whole party. A bare
 * number, never who: it's what everyone sees at the crypt, and it gates the
 * party info collectively (host → dónde → vestimenta → qué llevar → cuándo).
 */
export async function countSacrifices(): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(sum(1 + ${partyRsvps.plusOne}::int), 0)::int` })
    .from(partyRsvps)
    .where(and(eq(partyRsvps.eventSlug, PARTY_EVENT.slug), eq(partyRsvps.attending, true)));
  return n;
}

/** Admin-only read (Torre › /admin/party). Callers gate with requireAdmin(). */
export async function listRsvps() {
  return db
    .select()
    .from(partyRsvps)
    .where(eq(partyRsvps.eventSlug, PARTY_EVENT.slug))
    .orderBy(desc(partyRsvps.updatedAt));
}
