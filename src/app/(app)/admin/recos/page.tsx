import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import {
  getLinkGraphMetrics,
  getRecoMonthUsage,
  getRecoVersionMetrics,
} from "@/modules/recs/metrics";

/**
 * Founder dashboard for the cross-media reco loop: outcomes per
 * (promptVersion × model) + monthly meter health. This is the read side that
 * closes the improvement cycle — a prompt bump (CURRENT_PROMPT_VERSION) gets
 * judged here on acceptance + chips, not on vibes. Gated on isFounder, 404
 * for everyone else (same discipline as /admin/analytics).
 */
export default async function RecoMetricsPage() {
  const user = await requireUser();
  if (!user.isFounder) notFound();

  const [versions, months, graph] = await Promise.all([
    getRecoVersionMetrics(),
    getRecoMonthUsage(),
    getLinkGraphMetrics(),
  ]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-dock-clearance pt-8 text-text">
      <h1 className="text-xl font-bold">Recos · métricas por versión</h1>
      <p className="mt-2 text-sm text-text-2">
        Cada generación queda stampeada con promptVersion y modelo; aquí se
        compara qué versión produce recos que la gente acepta y celebra.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-text-2">
          Prompt × modelo
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th className="py-1">v</th>
              <th>Modelo</th>
              <th className="text-right">Gen.</th>
              <th className="text-right">Acept.</th>
              <th className="text-right">Chips +/−</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5 font-mono">v{v.promptVersion}</td>
                <td className="max-w-[9rem] truncate">{v.model ?? v.provider}</td>
                <td className="text-right font-mono">{v.generated}</td>
                <td className="text-right font-mono">
                  {v.accepted}
                  {v.generated > 0 && (
                    <span className="text-text-3">
                      {" "}
                      ({Math.round((v.accepted / v.generated) * 100)}%)
                    </span>
                  )}
                </td>
                <td className="text-right font-mono">
                  {v.feedbackPositive}/{v.feedbackNegative}
                </td>
              </tr>
            ))}
            {versions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-text-3">
                  Sin generaciones todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-text-2">
          Grafo de vínculos (F3.5.8)
        </h2>
        <p className="mb-2 text-xs text-text-3">
          Seeds con extracción corrida: {graph.seedsChecked}
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th className="py-1">Edge</th>
              <th>Fuente</th>
              <th className="text-right">Edges</th>
            </tr>
          </thead>
          <tbody>
            {graph.edgesByType.map((e, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5">{e.linkType}</td>
                <td className="max-w-[10rem] truncate">{e.source}</td>
                <td className="text-right font-mono">{e.count}</td>
              </tr>
            ))}
            {graph.edgesByType.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-text-3">
                  Sin edges todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-text-3">
          Recos por tipo de vínculo:{" "}
          {graph.recsByLinkType
            .map((r) => `${r.linkType ?? "legacy"} ${r.count}`)
            .join(" · ") || "—"}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-text-2">
          Meter mensual (ADR-009)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th className="py-1">Mes</th>
              <th className="text-right">Usuarios</th>
              <th className="text-right">Generaciones</th>
              <th className="text-right">Sin resultado</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.eraKey} className="border-t border-line">
                <td className="py-1.5 font-mono">{m.eraKey}</td>
                <td className="text-right font-mono">{m.users}</td>
                <td className="text-right font-mono">{m.generations}</td>
                <td className="text-right font-mono">
                  {m.spentNoMatch}
                  {m.generations > 0 && (
                    <span className="text-text-3">
                      {" "}
                      ({Math.round((m.spentNoMatch / m.generations) * 100)}%)
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-text-3">
                  Sin datos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
