import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { getOwnPicks, getPeopleForPicks } from "@/modules/social/people";
import { GenteFlow } from "./gente-flow";

/**
 * Kura · 32b "tu gente" and the service step after it. A server page because
 * the people depend on the picks the previous screen just saved: it reads
 * the account's three obsessions (its own rows) and the public profiles that
 * share them (cross-user, gated — see ../people.ts).
 *
 * Guard, mirror of /onboarding's: no name → back to O1b; no obsessions yet →
 * back to elige 3. A follow re-renders this page (followUserAction
 * revalidates), which is why the people read keeps followed profiles in and
 * the client keeps its own list once mounted.
 */
export default async function OnboardingGentePage() {
  const user = await requireUser();
  if (!user.name) redirect("/onboarding");
  const picks = await getOwnPicks(user.id);
  if (picks.length === 0) redirect("/onboarding");
  const people = await getPeopleForPicks(user.id);
  return <GenteFlow picks={picks} people={people} />;
}
