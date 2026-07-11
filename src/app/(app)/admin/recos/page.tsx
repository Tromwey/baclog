import { fetched, requireAdmin } from "@/modules/admin/guard";
import { getRecosMetrics, type RecosMetrics } from "@/modules/admin/metrics";
import {
  getLinkGraphMetrics,
  getRecoMonthUsage,
  getRecoVersionMetrics,
  type LinkGraphMetrics,
  type RecoMonthUsage,
  type RecoVersionMetrics,
} from "@/modules/recs/metrics";
import { Bar, Card, CardLabel, Dot, EmptyNote, SectionError } from "../ui";

/**
 * Recos — the moat's health panel. Top: the Torre de Control cards (model in
 * production, fiabilidad/latencia from llm_call_log, aceptación, feedback,
 * cap). Below: the improvement-cycle detail tables (prompt × modelo, link
 * graph, monthly meter) that judge a prompt bump on numbers, not vibes.
 */
export default async function RecosPage() {
  await requireAdmin();
  const [metrics, detail] = await Promise.all([
    fetched(getRecosMetrics()),
    fetched(
      Promise.all([
        getRecoVersionMetrics(),
        getLinkGraphMetrics(),
        getRecoMonthUsage(),
      ]),
    ),
  ]);

  return (
    <div className="flex flex-col gap-3 pt-1">
      {!metrics.ok ? (
        <Card>
          <CardLabel>Recomendaciones</CardLabel>
          <SectionError retryHref="/admin/recos" />
        </Card>
      ) : (
        <>
          <HeroModelCard m={metrics.data} />

          {metrics.data.calls30d === 0 ? (
            <Card className="flex items-start gap-[11px] !p-4">
              <Dot status="none" className="mt-[5px] h-2 w-2" />
              <div>
                <div className="text-[14px] leading-[1.45] text-text-2">
                  La telemetría LLM empieza vacía — aún sin llamadas registradas.
                </div>
                <div className="mt-[9px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
                  Fiabilidad y latencia aparecen con la primera generación
                </div>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-[10px]">
              <MiniTile
                label="Fallo"
                value={
                  metrics.data.failRate30d == null
                    ? "—"
                    : `${(metrics.data.failRate30d * 100).toFixed(1)}%`
                }
              />
              <MiniTile
                label="Lat. p50"
                value={fmtSecs(metrics.data.latencyP50Ms)}
              />
              <MiniTile
                label="Lat. p95"
                value={fmtSecs(metrics.data.latencyP95Ms)}
              />
            </div>
          )}

          {/* Tasa de aceptación */}
          <Card>
            <CardLabel>Tasa de aceptación</CardLabel>
            {metrics.data.acceptance.total === 0 ? (
              <EmptyNote>Aparece con la primera reco generada.</EmptyNote>
            ) : (
              <>
                <div className="mt-[11px] flex items-baseline gap-[11px]">
                  <span className="font-display text-[40px] font-extrabold leading-none tracking-[-0.02em] text-accent">
                    {Math.round(
                      (metrics.data.acceptance.accepted /
                        metrics.data.acceptance.total) *
                        100,
                    )}
                    %
                  </span>
                  <span className="text-[12.5px] leading-[1.3] text-text-3">
                    {metrics.data.acceptance.accepted} de{" "}
                    {metrics.data.acceptance.total}
                    <br />
                    recos agregadas
                  </span>
                </div>
                <Bar
                  className="mt-[13px]"
                  pct={
                    (metrics.data.acceptance.accepted /
                      metrics.data.acceptance.total) *
                    100
                  }
                />
              </>
            )}
          </Card>

          {/* Feedback del usuario */}
          <Card>
            <CardLabel>Feedback del usuario</CardLabel>
            {metrics.data.feedbackPositive.length === 0 &&
            metrics.data.feedbackNegative.length === 0 ? (
              <EmptyNote>Aún sin chips de feedback.</EmptyNote>
            ) : (
              <FeedbackBars
                positive={metrics.data.feedbackPositive}
                negative={metrics.data.feedbackNegative}
              />
            )}
          </Card>

          {/* Cap mensual */}
          <div className="flex items-center gap-[13px] rounded-[14px] bg-surface-1 px-[15px] py-[14px]">
            <span className="shrink-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.02em]">
              {metrics.data.cappedUsers}
            </span>
            <span className="flex-1 text-[13px] leading-[1.4] text-text-2">
              {metrics.data.cappedUsers === 1 ? "usuario topó" : "usuarios toparon"}{" "}
              el límite de{" "}
              <b className="font-semibold text-text">
                {metrics.data.generationCap} recos/mes
              </b>
              .
            </span>
          </div>
        </>
      )}

      {/* Detalle · ciclo de mejora (las tablas del /admin/recos original) */}
      {!detail.ok ? (
        <Card>
          <CardLabel>Detalle · ciclo de mejora</CardLabel>
          <SectionError retryHref="/admin/recos" />
        </Card>
      ) : (
        <DetailTables
          versions={detail.data[0]}
          graph={detail.data[1]}
          months={detail.data[2]}
        />
      )}
    </div>
  );
}

const MODEL_DISPLAY: Record<string, string> = {
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "claude-opus-4-8": "Claude Opus 4.8",
  fixture: "Fixture (determinista)",
};

const PROVIDER_DISPLAY: Record<string, string> = {
  gemini: "Google",
  anthropic: "Anthropic",
  fixture: "Fixture",
  llm: "LLM",
};

function fmtSecs(ms: number | null): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

function HeroModelCard({ m }: { m: RecosMetrics }) {
  const top = m.monthModels[0] ?? m.latestModel;
  const provider = top ? (PROVIDER_DISPLAY[top.provider] ?? top.provider) : "—";
  const model = top?.model ? (MODEL_DISPLAY[top.model] ?? top.model) : "—";
  const sub =
    m.monthModels.length <= 1
      ? "Único modelo en producción"
      : `${m.monthModels.length} modelos este mes`;
  return (
    <Card>
      <CardLabel>Generaciones por modelo · mes</CardLabel>
      <div className="mt-[13px] flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-3">
            {provider}
          </div>
          <div className="mt-[3px] font-serif text-[22px] italic leading-[1.12] text-text">
            {model}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-[32px] font-extrabold leading-none tracking-[-0.02em]">
            {m.generationsMonth}
          </div>
          <div className="mt-[3px] font-mono text-[9px] tracking-[0.05em] text-text-3">
            GENERACIONES
          </div>
        </div>
      </div>
      <div className="mt-[13px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
        {sub}
      </div>
    </Card>
  );
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-surface-1 px-[11px] py-[13px]">
      <div className="font-mono text-[9px] uppercase tracking-[0.05em] text-text-3">
        {label}
      </div>
      <div className="mt-[9px] font-display text-[23px] font-extrabold leading-none tracking-[-0.02em]">
        {value}
      </div>
    </div>
  );
}

function FeedbackBars({
  positive,
  negative,
}: {
  positive: { label: string; count: number }[];
  negative: { label: string; count: number }[];
}) {
  const max = Math.max(
    ...positive.map((f) => f.count),
    ...negative.map((f) => f.count),
    1,
  );
  const Row = ({
    item,
    fillClass,
  }: {
    item: { label: string; count: number };
    fillClass: string;
  }) => (
    <div className="flex items-center gap-[10px]">
      <span className="flex-1 text-[12.5px] text-text">{item.label}</span>
      <Bar
        className="w-[92px] shrink-0"
        heightClass="h-[7px]"
        fillClass={fillClass}
        pct={(item.count / max) * 100}
      />
      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-text-2">
        {item.count}
      </span>
    </div>
  );
  return (
    <>
      <div className="mb-[11px] mt-[14px] flex items-center gap-2">
        <Dot status="ok" />
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-2">
          Positivas
        </span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {positive.length === 0 ? (
          <span className="text-[12.5px] text-text-3">— todavía nada</span>
        ) : (
          positive.map((f) => <Row key={f.label} item={f} fillClass="bg-accent" />)
        )}
      </div>
      <div className="mb-[11px] mt-4 flex items-center gap-2">
        <Dot status="bad" />
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-2">
          Negativas
        </span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {negative.length === 0 ? (
          <span className="text-[12.5px] text-text-3">— todavía nada</span>
        ) : (
          negative.map((f) => <Row key={f.label} item={f} fillClass="bg-bad" />)
        )}
      </div>
    </>
  );
}

function DetailTables({
  versions,
  graph,
  months,
}: {
  versions: RecoVersionMetrics[];
  graph: LinkGraphMetrics;
  months: RecoMonthUsage[];
}) {
  return (
    <>
      <Card>
        <CardLabel>Detalle · prompt × modelo</CardLabel>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
            <tr>
              <th className="py-1 font-normal">v</th>
              <th className="font-normal">Modelo</th>
              <th className="text-right font-normal">Gen.</th>
              <th className="text-right font-normal">Acept.</th>
              <th className="text-right font-normal">Chips +/−</th>
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
      </Card>

      <Card>
        <CardLabel>Detalle · grafo de vínculos (F3.5.8)</CardLabel>
        <p className="mt-2 text-xs text-text-3">
          Seeds con extracción corrida: {graph.seedsChecked}
        </p>
        <table className="mt-1 w-full text-sm">
          <thead className="text-left font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
            <tr>
              <th className="py-1 font-normal">Edge</th>
              <th className="font-normal">Fuente</th>
              <th className="text-right font-normal">Edges</th>
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
      </Card>

      <Card>
        <CardLabel>Detalle · meter mensual (ADR-009)</CardLabel>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
            <tr>
              <th className="py-1 font-normal">Mes</th>
              <th className="text-right font-normal">Usuarios</th>
              <th className="text-right font-normal">Gen.</th>
              <th className="text-right font-normal">Sin resultado</th>
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
      </Card>
    </>
  );
}
