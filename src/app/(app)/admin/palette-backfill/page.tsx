import { requireAdmin } from "@/modules/admin/guard";
import { BackfillRunner } from "./backfill-runner";

/**
 * F3.6.1 — one-off maintenance tool: re-extract every backlog item's
 * paletteHex with the new vividness-scored algorithm. Founder-gated (same
 * discipline as /admin/analytics), non-founders get a 404.
 */
export default async function PaletteBackfillPage() {
  await requireAdmin();

  // Content-only: the /admin layout (Torre de Control) provides the
  // container, header and tab chrome.
  return (
    <main className="pt-1 text-text">
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
