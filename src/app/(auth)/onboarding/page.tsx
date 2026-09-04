import { requireUser } from "@/auth";
import { getOnboardingPoolPage } from "@/modules/backlog/onboarding-pool";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * Server wrapper: renders the FIRST page of the "Elige tres" pool (provider
 * data, no PII) so the grid paints with the page — no spinner on step 2; the
 * client fetches the rest from /api/onboarding/pool as it scrolls. Starts at
 * step 2 when step 1 is already done (a reload mid-flow shouldn't ask for
 * the name again).
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const first = await getOnboardingPoolPage(1);
  return (
    <OnboardingFlow
      initialPool={first.items}
      initialNextPage={first.nextPage}
      initialStep={user.name ? 2 : 1}
    />
  );
}
