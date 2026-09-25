import { CardStackSkeleton } from "../ui";

/**
 * /admin/trafico skeleton — eventos públicos (row list), país × dispositivo
 * (legend + stacked bars) and viewers vs usuarios. Own file so the Pulso
 * skeleton above doesn't paint here.
 */
export default function Loading() {
  return <CardStackSkeleton bodies={[180, 150, 136]} />;
}
