import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { BackfillRunner } from "./backfill-runner";

/**
 * F3.6.1 — one-off maintenance tool: re-extract every backlog item's
 * paletteHex with the new vividness-scored algorithm. Founder-gated (same
 * discipline as /admin/analytics), non-founders get a 404.
 */
export default async function PaletteBackfillPage() {
  const user = await requireUser();
  if (!user.isFounder) notFound();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-dock-clearance pt-8 text-text">
      <h1 className="text-xl font-bold">Backfill de paleta (ADN)</h1>
      <p className="mt-2 text-sm text-text-2">
        Re-extrae el color dominante de cada item con el algoritmo nuevo
        (llamativo, no solo frecuente). Corre en tu navegador — necesita
        canvas para leer los píxeles de cada portada.
      </p>
      <BackfillRunner />
    </main>
  );
}
