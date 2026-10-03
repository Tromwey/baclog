import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { isOnboarded } from "@/auth/user-row";
import { getBacklogNames } from "@/modules/backlog/queries";
import { getOnboardingPoolPage } from "@/modules/backlog/onboarding-pool";
import { OnboardingFlow } from "./onboarding-flow";
import { getOwnPicks } from "@/modules/social/people";
import { safeReturnTo } from "@/lib/return-to";

/**
 * Server wrapper for the first two onboarding screens (Kura O1b + 32a).
 * Renders the FIRST page of the "elige 3" pool (provider data, no PII) so the
 * grid paints with the page; the client fetches the rest as it scrolls.
 *
 * A reload resumes where the account is: onboarding not finished (no name, or
 * — an older account — a name but no birth year: `isOnboarded`) → O1b, which
 * asks for both, so the `(app)` layout's redirect here can't loop; done but no
 * obsessions → elige 3; obsessions already saved → tu gente
 * (/onboarding/gente, whose own guard is the mirror of this one — obsessions
 * or back here — so the two can't bounce).
 *
 * An OLDER account (a name, no birth year — it predates the F2.2 gate, and
 * usually has a library and a handle already) only owes the year: the user
 * step runs in `resume` mode (year only, its name untouched, no handle
 * field) and then goes straight into the app. "Elige 3" is for an account
 * with NOTHING — it creates a collection and three obsessions, which an
 * existing library must never get a second time; so a finished account
 * that already has collections skips it here too, whichever way it arrived.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>;
}) {
  const user = await requireUser();
  // Colecciones de fiesta (contract §3): with a `?to=`, the user step is the
  // only one — once onboarding is finished, back to the party.
  const to = safeReturnTo((await searchParams).to as string | undefined);
  const onboarded = isOnboarded(user);
  if (to && onboarded) redirect(to);
  // Collections FIRST: a finished account that already has a library belongs
  // in the app, whatever its picks say (a finished account always has picks,
  // so asking about them first sent every one of them back to "tu gente").
  // Picks without a collection = the seed was cut short: resume at people.
  if (onboarded && (await getBacklogNames(user.id)).length > 0) redirect("/backlogs");
  if (onboarded && (await getOwnPicks(user.id)).length > 0) {
    redirect("/onboarding/gente");
  }
  const resumeName = !onboarded ? user.name : null;
  const first = await getOnboardingPoolPage(1);
  return (
    <OnboardingFlow
      initialPool={first.items}
      initialNextPage={first.nextPage}
      initialStep={onboarded ? "picks" : "usuario"}
      returnTo={to}
      resumeName={resumeName}
      afterUser={resumeName !== null ? "app" : "picks"}
    />
  );
}
