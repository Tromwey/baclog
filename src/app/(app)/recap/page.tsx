import Link from "next/link";
import { requireUser } from "@/auth";
import { buildLatestRecap } from "@/modules/backlog/recap";
import { CardExporter } from "@/components/card-exporter";

const ES_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-07" → "tu era de julio" (sistema-diseno §7 · F3.3 "tu era de {mes}"). */
function esEraLabel(eraKey: string): string {
  const month = ES_MONTHS[Number(eraKey.slice(5)) - 1] ?? "este mes";
  return `tu era de ${month}`;
}

/**
 * F3.5.7 — a backlog's monthly ERA exports the PATTERN card as the monthly
 * compilation ("tu era de {mes}"). This is the SAME F3.3 recap ritual (the
 * recap cron on day 1 drives users here) — not a second monthly-recap
 * mechanism: the pattern card IS the era recap.
 */
export default async function RecapPage() {
  const user = await requireUser();
  const recap = await buildLatestRecap(user.id, user.username);

  if (!recap) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-16 pt-8 text-text">
        <h1 className="text-xl font-bold">Tu recap</h1>
        <div className="mt-16 text-center">
          <p className="text-text-2">Todavía no hay nada que recapitular.</p>
          <p className="mt-1 text-sm text-text-3">
            Agrega ítems y marca estados — tu era del mes aparece aquí.
          </p>
          <Link
            href="/search"
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg"
          >
            Buscar algo que agregar
          </Link>
        </div>
      </main>
    );
  }

  const label = esEraLabel(recap.eraKey);

  return (
    // The pattern card renders the era's items as its generative field; the
    // Spanish era label becomes the card title (email/cron path untouched).
    <CardExporter
      backlog={{ ...recap.cardBacklog, name: label }}
      style="pattern"
      eyebrow={label}
      subtitle={`${recap.totalItems} obsesiones · ${recap.completedCount} completadas${
        recap.topGenre ? ` · ${recap.topGenre}` : ""
      }`}
      publicUrl={
        user.username && user.isPublic
          ? `https://baclog.app/${user.username}`
          : null
      }
    />
  );
}
