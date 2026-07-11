import Link from "next/link";
import { fetched, requireAdmin } from "@/modules/admin/guard";
import { getPulsoMetrics } from "@/modules/admin/metrics";
import {
  firstActionable,
  runHealthChecks,
  STATUS_WORD,
} from "@/modules/admin/checks";
import {
  Bar,
  Card,
  CardLabel,
  Dot,
  fmtUsd,
  SectionError,
  StatTile,
  STATUS_TEXT_CLASS,
  STATUS_WASH_CLASS,
} from "./ui";

/**
 * Pulso — the 10-second screen: global semáforo, the traction-gate hero
 * (M2: ~50 usuarios compartiendo — THE product metric right now), the key
 * numbers grid, and "qué arreglar hoy" (worst failing check).
 */
export default async function PulsoPage() {
  await requireAdmin();
  const [pulso, health] = await Promise.all([
    fetched(getPulsoMetrics()),
    fetched(runHealthChecks()),
  ]);

  const action = health.ok ? firstActionable(health.data) : null;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Semáforo strip → Salud */}
      {health.ok ? (
        <Link
          href="/admin/salud"
          className={`flex items-center gap-[13px] rounded-[15px] px-[15px] py-[14px] ${STATUS_WASH_CLASS[health.data.status]}`}
        >
          <Dot status={health.data.status} className="h-[13px] w-[13px]" />
          <span className="min-w-0 flex-1">
            <span
              className={`block font-mono text-[13.5px] font-bold tracking-[0.06em] ${STATUS_TEXT_CLASS[health.data.status]}`}
            >
              {STATUS_WORD[health.data.status]}
            </span>
            <span className="mt-[2px] block text-[12.5px] text-text-2">
              {healthSummaryLine(health.data.status)}
            </span>
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-text-3">
            SALUD ›
          </span>
        </Link>
      ) : (
        <Card>
          <SectionError
            message="No pudimos correr los checks ahora mismo."
            retryHref="/admin"
          />
        </Card>
      )}

      {/* Gate de tracción — hero */}
      {pulso.ok ? (
        <>
          <div className="relative overflow-hidden rounded-[18px] bg-surface-1 px-4 pb-[17px] pt-[18px]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_95%_at_88%_-12%,rgba(216,255,62,0.11),rgba(216,255,62,0)_58%)]" />
            <div className="relative">
              <CardLabel>Progreso al gate de tracción</CardLabel>
              <div className="mt-[11px] flex items-baseline gap-[7px]">
                <span className="font-display text-[66px] font-extrabold leading-[0.85] tracking-[-0.03em] text-accent">
                  {pulso.data.gateCurrent}
                </span>
                <span className="font-display text-[28px] font-bold leading-none text-text-3">
                  / {pulso.data.gateGoal}
                </span>
              </div>
              <Bar
                className="mt-[15px]"
                heightClass="h-[9px]"
                pct={(pulso.data.gateCurrent / pulso.data.gateGoal) * 100}
              />
              <div className="mt-[13px] max-w-[26ch] font-serif text-[19px] italic leading-[1.22]">
                {gateSerifLine(pulso.data.gateCurrent, pulso.data.gateGoal)}
              </div>
              <div className="mt-[9px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-text-3">
                Compartieron ≥1 tarjeta · últimos 30d
              </div>
            </div>
          </div>

          {/* Números clave */}
          <div className="grid grid-cols-2 gap-[10px]">
            <StatTile
              label="Usuarios"
              value={dash(pulso.data.totalUsers)}
              sub={pulso.data.totalUsers > 0 ? "acumulado" : "aún sin altas"}
              spark={
                pulso.data.usersSpark.some((v) => v > 0)
                  ? pulso.data.usersSpark
                  : undefined
              }
            />
            <StatTile
              label="Nuevos · 7d"
              value={dash(pulso.data.newUsers7d)}
              sub={pulso.data.newUsers7d > 0 ? "esta semana" : "aún sin señal"}
            />
            <StatTile
              label="Activos · 7d"
              value={dash(pulso.data.activeUsers7d)}
              sub={
                pulso.data.activeUsers7d > 0
                  ? `de ${pulso.data.totalUsers} · 7d`
                  : "aún sin señal"
              }
            />
            <StatTile
              label="Recos · mes"
              value={dash(pulso.data.recoGenerationsMonth)}
              sub={
                pulso.data.recoGenerationsMonth > 0
                  ? "generadas · mes"
                  : "sin generaciones"
              }
            />
            <StatTile
              label="Burn · mes"
              value={fmtUsd(
                pulso.data.llmCostMonthUsd + pulso.data.fixedCostMonthUsd,
              )}
              sub={`${fmtUsd(pulso.data.llmCostMonthUsd)} LLM + ${fmtUsd(pulso.data.fixedCostMonthUsd)} fijos`}
            />
            <StatTile
              label="Costo / activo"
              value={
                pulso.data.activeUsers7d > 0
                  ? fmtUsd(pulso.data.llmCostMonthUsd / pulso.data.activeUsers7d)
                  : "—"
              }
              sub={pulso.data.activeUsers7d > 0 ? "LLM / activo" : "aún sin señal"}
            />
          </div>
        </>
      ) : (
        <Card>
          <div className="flex items-center gap-2">
            <Dot status="bad" />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
              Números clave
            </span>
          </div>
          <SectionError retryHref="/admin" />
        </Card>
      )}

      {/* Qué arreglar hoy */}
      {health.ok &&
        (action ? (
          <div className="flex items-start gap-3 rounded-[14px] bg-surface-1 p-[15px]">
            <Dot status={action.status} className="mt-1 h-[9px] w-[9px]" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.09em] text-text-3">
                Qué arreglar hoy
              </div>
              <div className="mt-[5px] text-[14.5px] font-medium leading-[1.35] text-text">
                {action.name} — {action.value}
              </div>
              {action.action && (
                <div className="mt-[7px] font-mono text-[11px] leading-[1.4] text-accent">
                  → {action.action}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-[14px] bg-surface-1 p-[15px] text-[13px] leading-[1.4] text-text-3">
            Sin pendientes hoy — aún nada que arreglar, aún nada que medir.
          </div>
        ))}
    </div>
  );
}

function dash(n: number): string {
  return n > 0 ? String(n) : "—";
}

function gateSerifLine(current: number, goal: number): string {
  if (current === 0) return "El marcador está en cero. Que empiece el juego.";
  if (current >= goal) return "Gate cruzado — hora de abrir el siguiente capítulo.";
  return `Faltan ${goal - current} usuarios compartiendo en 30 días.`;
}

function healthSummaryLine(status: "ok" | "warn" | "bad" | "none"): string {
  if (status === "bad") return "Algo necesita tu atención ya";
  if (status === "warn") return "Hay algo por revisar hoy";
  if (status === "ok") return "Todo en orden";
  return "Aún sin datos este mes";
}
