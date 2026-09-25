import { HealthListSkeleton } from "../ui";

/**
 * /admin/salud skeleton — the semáforo strip and the divide-y list of checks.
 * Own file so the Pulso skeleton above doesn't paint here.
 */
export default function Loading() {
  return <HealthListSkeleton />;
}
