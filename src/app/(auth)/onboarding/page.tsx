import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { getOnboardingPoolPage } from "@/modules/backlog/onboarding-pool";
import { OnboardingFlow } from "./onboarding-flow";
import { getOwnPicks } from "@/modules/social/people";
import { safeReturnTo } from "@/lib/return-to";

/**
 * Server wrapper for the first two onboarding screens (Kura O1b + 32a).
 * Renders the FIRST page of the "elige 3" pool (provider data, no PII) so the
 * grid paints with the page; the client fetches the rest as it scrolls.
 *
 * A reload resumes where the account is: no name yet → O1b; a name but no
 * obsessions → elige 3; obsessions already saved → tu gente
 * (/onboarding/gente, whose own guard is the mirror of this one — obsessions
 * or back here — so the two can't bounce).
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>;
}) {
  const user = await requireUser();
  // Colecciones de fiesta (contract §3): with a `?to=`, the user step is the
  // only one — once there's a name, back to the party.
  const to = safeReturnTo((await searchParams).to as string | undefined);
  if (to && user.name) redirect(to);
  if (user.name && (await getOwnPicks(user.id)).length > 0) {
    redirect("/onboarding/gente");
  }
  const first = await getOnboardingPoolPage(1);
  return (
    <OnboardingFlow
      initialPool={first.items}
      initialNextPage={first.nextPage}
      initialStep={user.name ? "picks" : "usuario"}
      returnTo={to}
    />
  );
}
