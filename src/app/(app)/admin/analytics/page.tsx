import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import {
  getGeoDeviceBreakdown,
  getViewerVsUserSplit,
} from "@/modules/analytics/aggregate";

/**
 * F3.4 founder dashboard — the ADR-000 signal as plain tables. Gated on
 * isFounder (same authz discipline as the rest of the app); non-founders
 * get a 404 (no oracle that this route exists).
 */
export default async function AnalyticsDashboard() {
  const user = await requireUser();
  if (!user.isFounder) notFound();

  const [geo, split] = await Promise.all([
    getGeoDeviceBreakdown(),
    getViewerVsUserSplit(),
  ]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pb-dock-clearance pt-8 text-text">
      <h1 className="text-xl font-bold">Analytics · señal ADR-000</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-text-2">
          Viewers vs usuarios por país
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th className="py-1">Audiencia</th>
              <th>País</th>
              <th className="text-right">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {split.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5">{r.audience}</td>
                <td>{r.country ?? "—"}</td>
                <td className="text-right font-mono">{r.count}</td>
              </tr>
            ))}
            {split.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-text-3">
                  Sin datos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-text-2">
          País × dispositivo
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-3">
            <tr>
              <th className="py-1">País</th>
              <th>Dispositivo</th>
              <th className="text-right">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {geo.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1.5">{r.country ?? "—"}</td>
                <td>{r.device}</td>
                <td className="text-right font-mono">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
