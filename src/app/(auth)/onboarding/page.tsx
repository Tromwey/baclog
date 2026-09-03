import { requireUser } from "@/auth";
import { getOnboardingPool } from "@/modules/backlog/onboarding-pool";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * Server wrapper: loads the "Elige tres" pool (aggregate counts, no PII) so
 * the client flow needs no action to read it. Starts at step 2 when step 1
 * is already done (a reload mid-flow shouldn't ask for the name again).
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const pool = await getOnboardingPool(9);
  return <OnboardingFlow pool={pool} initialStep={user.name ? 2 : 1} />;
}
