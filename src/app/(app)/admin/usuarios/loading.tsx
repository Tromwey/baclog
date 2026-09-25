import { CardStackSkeleton } from "../ui";

/**
 * /admin/usuarios skeleton — its four cards: altas por semana (the 116 bar
 * chart), cohorte fundador (one meter), the activation funnel and por país.
 * Own file so the Pulso skeleton above doesn't paint here.
 */
export default function Loading() {
  return <CardStackSkeleton bodies={[134, 44, 172, 112]} />;
}
