import { fetched, requireAdmin } from "@/modules/admin/guard";
import { countryLabel, getTraficoMetrics } from "@/modules/admin/metrics";
import { getViewerVsUserSplit } from "@/modules/analytics/aggregate";
import { Card, CardLabel, EmptyNote, SectionError, Sparkline } from "../ui";

/**
 * Tráfico — evolución de analytics_event (F3.4) en el tiempo. Absorbe el
 * viejo /admin/analytics: eventos públicos con sparkline semanal, país ×
 * dispositivo, y el split viewers-vs-usuarios (la señal ADR-000 original).
 */
export default async function TraficoPage() {
  await requireAdmin();
  const [metrics, split] = await Promise.all([
    fetched(getTraficoMetrics()),
    fetched(getViewerVsUserSplit()),
  ]);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Eventos públicos */}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <CardLabel>Eventos públicos</CardLabel>
          <span className="font-mono text-[9.5px] tracking-[0.04em] text-text-3">
            últimas 6 semanas
          </span>
        </div>
        {!metrics.ok ? (
          <SectionError
            message="No pudimos cargar los eventos. El resto sigue en pie."
            retryHref="/admin/trafico"
          />
        ) : metrics.data.events.every((e) => e.total === 0) ? (
          <EmptyNote>Aún sin eventos públicos registrados.</EmptyNote>
        ) : (
          <div className="mt-2 flex flex-col">
            {metrics.data.events.map((e, i) => (
              <div
                key={e.name}
                className={`flex items-center gap-3 py-[11px] ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="flex-1 text-[13px] text-text">{e.name}</span>
                <Sparkline values={e.series} width={76} height={22} />
                <span className="w-8 shrink-0 text-right font-mono text-[12px] text-text">
                  {e.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* País × dispositivo */}
      <Card>
        <CardLabel>País × dispositivo</CardLabel>
        {!metrics.ok ? (
          <SectionError retryHref="/admin/trafico" />
        ) : metrics.data.devices.length === 0 ? (
          <EmptyNote>Aún sin señal por dispositivo.</EmptyNote>
        ) : (
          <>
            <div className="mb-[15px] mt-[13px] flex flex-wrap gap-[15px]">
              <LegendSwatch swatchClass="bg-text" label="iOS" />
              <LegendSwatch swatchClass="bg-text-2" label="Android" />
              <LegendSwatch swatchClass="bg-text-3" label="Web" />
            </div>
            <div className="flex flex-col gap-3">
              {metrics.data.devices.map((d) => {
                const total = d.ios + d.android + d.web || 1;
                return (
                  <div key={d.name}>
                    <div className="mb-[6px] flex justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.03em] text-text-2">
                        {d.name}
                      </span>
                      <span className="font-mono text-[10px] text-text-3">
                        {d.ios + d.android + d.web}
                      </span>
                    </div>
                    <div className="flex h-[9px] gap-[1.5px] overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="bg-text"
                        style={{ width: `${((d.ios / total) * 100).toFixed(1)}%` }}
                      />
                      <div
                        className="bg-text-2"
                        style={{
                          width: `${((d.android / total) * 100).toFixed(1)}%`,
                        }}
                      />
                      <div
                        className="bg-text-3"
                        style={{ width: `${((d.web / total) * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Viewers vs usuarios (señal ADR-000, heredado de /admin/analytics) */}
      <Card>
        <CardLabel>Viewers vs usuarios · país</CardLabel>
        {!split.ok ? (
          <SectionError retryHref="/admin/trafico" />
        ) : split.data.length === 0 ? (
          <EmptyNote>Aún sin datos.</EmptyNote>
        ) : (
          <div className="mt-2 flex flex-col">
            {split.data.slice(0, 12).map((r, i) => (
              <div
                key={`${r.audience}-${r.country}-${i}`}
                className={`flex items-center gap-3 py-[9px] ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="w-[64px] shrink-0 font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-2">
                  {r.audience === "viewer" ? "Viewer" : "Usuario"}
                </span>
                <span className="flex-1 text-[13px] text-text">
                  {r.country ? countryLabel(r.country) : "Desconocido"}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-text">
                  {r.count}
                </span>
              </div>
            ))}
            {split.data.length > 12 && (
              <div className="border-t border-line py-[9px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
                +{split.data.length - 12} combinaciones más
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function LegendSwatch({
  swatchClass,
  label,
}: {
  swatchClass: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-[6px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-2">
      <span className={`h-[9px] w-[9px] rounded-[2px] ${swatchClass}`} />
      {label}
    </span>
  );
}
