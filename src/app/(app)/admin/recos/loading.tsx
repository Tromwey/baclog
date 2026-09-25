import { CardStackSkeleton } from "../ui";

/**
 * /admin/recos skeleton — the model hero card, the 3-up fallo / latencia
 * tiles, then aceptación and feedback. Own file so the Pulso skeleton above
 * doesn't paint here.
 */
export default function Loading() {
  return <CardStackSkeleton bodies={[56, 72, 140]} tiles={3} />;
}
