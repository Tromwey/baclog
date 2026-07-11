import "server-only";
import { cache } from "react";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { recapSends, reports, users } from "@/db/schema";
import { previousMonthKey } from "@/modules/backlog/recap";
import { BURN_BAD_USD, BURN_WARN_USD, fixedMonthlyCostUsd } from "./costs";
import {
  TRACTION_GATE_GOAL,
  gateProgress,
  llmCostMonthUsd,
  llmHealthWindow,
  trafficWeekOverWeek,
} from "./metrics";

/**
 * Torre de Control — the deterministic health-check engine (founder decision:
 * rules with thresholds in code, no LLM narration). Each check answers with a
 * status + a measured value, and when it fails, a CONCRETE action item ("qué
 * arreglar hoy") with a where-to-look pointer. A check without enough data
 * says "none" (sin señal) — never a false green.
 */

export type CheckStatus = "ok" | "warn" | "bad" | "none";

export interface HealthCheck {
  id: string;
  name: string;
  status: CheckStatus;
  /** The measured value, mono-styled in the UI ("2.8% de 214 · umbral 5%"). */
  value: string;
  /** The action item — only present when there is something to do. */
  action?: string;
  /** Where to do it ("Vercel › Settings › Cron Jobs"). */
  where?: string;
}

export interface HealthReport {
  /** Global semáforo: worst status wins (bad > warn > ok > none). */
  status: CheckStatus;
  /** "1 problema · 2 atención · 4 ok" — the header pill subtitle. */
  summary: string;
  checks: HealthCheck[];
}

export const STATUS_WORD: Record<CheckStatus, string> = {
  ok: "BIEN",
  warn: "ATENCIÓN",
  bad: "PROBLEMA",
  none: "SIN SEÑAL",
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const usd = (n: number) => `$${n.toFixed(2)}`;

// LLM health thresholds (24h window; under MIN_CALLS the check has no signal).
const LLM_MIN_CALLS = 5;
const LLM_FAIL_WARN = 0.05;
const LLM_FAIL_BAD = 0.2;
const LLM_P95_WARN_MS = 6_000;
const LLM_P95_BAD_MS = 10_000;
// Traffic-drop check needs a real baseline before it can accuse anything.
const TRAFFIC_MIN_BASELINE = 10;
const TRAFFIC_DROP_WARN = 0.5;

function llmFailureCheck(w: {
  total: number;
  failures: number;
  moderated: number;
}): HealthCheck {
  const base = { id: "llm-fail", name: "Tasa de fallo LLM" };
  if (w.total < LLM_MIN_CALLS) {
    return {
      ...base,
      status: "none",
      value: `${w.total} llamadas en 24h · aún sin señal`,
    };
  }
  // Provider failures only — a moderation rejection is OUR deterministic
  // screen acting on usable model output, not a provider incident. It gets
  // its own annotation so a prompt regression doesn't send the founder
  // hunting for 429s that don't exist.
  const rate = w.failures / w.total;
  const status = rate > LLM_FAIL_BAD ? "bad" : rate > LLM_FAIL_WARN ? "warn" : "ok";
  const moderationNote =
    w.moderated > 0 ? ` · ${w.moderated} por moderación propia` : "";
  return {
    ...base,
    status,
    value: `${pct(rate)} de ${w.total} · umbral ${pct(LLM_FAIL_WARN)}${moderationNote}`,
    ...(status !== "ok" && {
      action:
        "Revisa quota y errores del provider — busca «[crossmedia]» en los logs de función",
      where: "Vercel › Logs",
    }),
  };
}

function llmLatencyCheck(w: { total: number; p95Ms: number | null }): HealthCheck {
  const base = { id: "llm-p95", name: "Latencia p95" };
  if (w.total < LLM_MIN_CALLS || w.p95Ms == null) {
    return { ...base, status: "none", value: "aún sin señal" };
  }
  const status =
    w.p95Ms > LLM_P95_BAD_MS ? "bad" : w.p95Ms > LLM_P95_WARN_MS ? "warn" : "ok";
  return {
    ...base,
    status,
    value: `${secs(w.p95Ms)} · umbral ${secs(LLM_P95_WARN_MS)}`,
    ...(status !== "ok" && {
      action:
        "El provider está lento — considera cambiar CROSSMEDIA_PROVIDER o el modelo",
      where: "Vercel › Settings › Environment Variables",
    }),
  };
}

async function recapCronCheck(): Promise<HealthCheck> {
  const base = { id: "recap-cron", name: "Cron de recap" };
  const now = new Date();
  // The cron stamps recap_send rows with the month it RECAPS — the PREVIOUS
  // one (cron/recap/route.ts uses previousMonthKey). Querying the current
  // month here would be a permanent false PROBLEMA.
  const era = previousMonthKey(now);
  if (now.getUTCDate() === 1) {
    return { ...base, status: "none", value: "corre hoy · día 1, 9:00 UTC" };
  }
  const [[sends], [eligible]] = await Promise.all([
    db
      .select({ c: count() })
      .from(recapSends)
      .where(eq(recapSends.eraKey, era)),
    db
      .select({ c: count() })
      .from(users)
      .where(sql`${users.createdAt} < date_trunc('month', now())`),
  ]);
  if ((eligible?.c ?? 0) === 0) {
    return { ...base, status: "none", value: "aún sin usuarios que recapear" };
  }
  if ((sends?.c ?? 0) === 0) {
    return {
      ...base,
      status: "bad",
      value: `no corrió el día 1 (recap de ${era})`,
      action: "Revisa CRON_SECRET y el estado del cron /api/cron/recap",
      where: "Vercel › Settings › Cron Jobs",
    };
  }
  return {
    ...base,
    status: "ok",
    value: `corrió · ${sends!.c} recaps de ${era}`,
  };
}

async function reportsCheck(): Promise<HealthCheck> {
  const base = { id: "reports", name: "Reportes de contenido" };
  const [recent] = await db
    .select({ c: count() })
    .from(reports)
    .where(sql`${reports.createdAt} > now() - interval '14 days'`);
  const n = recent?.c ?? 0;
  if (n === 0) return { ...base, status: "ok", value: "0 recientes (14d)" };
  return {
    ...base,
    status: "warn",
    value: `${n} en los últimos 14 días`,
    action: "Revisa la tabla report y actúa sobre el contenido señalado",
    where: "Neon › tabla report",
  };
}

function trafficCheck(w: { current: number; previous: number }): HealthCheck {
  const base = { id: "traffic", name: "Tráfico semana / semana" };
  if (w.previous < TRAFFIC_MIN_BASELINE) {
    return {
      ...base,
      status: "none",
      value: `${w.current} eventos esta semana · base insuficiente`,
    };
  }
  const delta = (w.current - w.previous) / w.previous;
  if (delta < -TRAFFIC_DROP_WARN) {
    return {
      ...base,
      status: "warn",
      value: `${pct(delta)} vs. semana pasada`,
      action:
        "El tráfico cayó a más de la mitad — revisa distribución y links públicos",
      where: "Tab Tráfico",
    };
  }
  return {
    ...base,
    status: "ok",
    value: `${delta >= 0 ? "+" : ""}${pct(delta)} vs. semana pasada`,
  };
}

function burnCheck(llmMonth: number): HealthCheck {
  const base = { id: "burn", name: "Burn proyectado" };
  const now = new Date();
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Floor the divisor at 3 elapsed days: on day 1 a demo burst would be
  // multiplied ×31 against ~$24 of headroom and flip the semáforo, only to
  // self-clear days later. Early-month reads as "aún poca señal", not alarma.
  const projected =
    (llmMonth / Math.max(3, now.getUTCDate())) * daysInMonth +
    fixedMonthlyCostUsd();
  const status =
    projected > BURN_BAD_USD ? "bad" : projected > BURN_WARN_USD ? "warn" : "ok";
  return {
    ...base,
    status,
    value: `${usd(projected)} proyectado · umbral ${usd(BURN_WARN_USD)}`,
    ...(status !== "ok" && {
      action:
        "El gasto LLM se disparó — revisa el modelo activo y el cap de 20 recos/mes",
      where: "Tab Recos · admin/costs.ts",
    }),
  };
}

function gateSignalCheck(gateCurrent: number): HealthCheck {
  const base = { id: "gate-signal", name: "Señal de mercado inicial" };
  if (gateCurrent >= TRACTION_GATE_GOAL) {
    return {
      ...base,
      status: "ok",
      value: `${gateCurrent} usuarios compartiendo · meta ${TRACTION_GATE_GOAL}`,
      action: "Gate cruzado — hora de decidir ADR-000 y abrir M4",
      where: "Vault › ADR-000-mercado-inicial",
    };
  }
  return {
    ...base,
    status: "none",
    value: `${gateCurrent} usuarios compartiendo en 30d`,
    action: `Faltan ~${TRACTION_GATE_GOAL - gateCurrent} para decidir el mercado con confianza`,
  };
}

/**
 * Run every check. Wrapped in React cache() so the layout's health pill and
 * the Salud tab share one execution per request. Throws on a DB-level failure
 * — callers wrap in fetched() and render the section error state.
 */
export const runHealthChecks = cache(async (): Promise<HealthReport> => {
  const [llm24h, wow, llmMonth, gateCurrent, recap, reportsResult] =
    await Promise.all([
      llmHealthWindow(24),
      trafficWeekOverWeek(),
      llmCostMonthUsd(),
      gateProgress(),
      recapCronCheck(),
      reportsCheck(),
    ]);

  const checks: HealthCheck[] = [
    llmFailureCheck(llm24h),
    llmLatencyCheck(llm24h),
    recap,
    reportsResult,
    trafficCheck(wow),
    burnCheck(llmMonth),
    gateSignalCheck(gateCurrent),
  ];

  const counts = { ok: 0, warn: 0, bad: 0, none: 0 };
  for (const c of checks) counts[c.status] += 1;
  const status: CheckStatus =
    counts.bad > 0 ? "bad" : counts.warn > 0 ? "warn" : counts.ok > 0 ? "ok" : "none";

  const parts: string[] = [];
  if (counts.bad) parts.push(`${counts.bad} problema${counts.bad > 1 ? "s" : ""}`);
  if (counts.warn) parts.push(`${counts.warn} atención`);
  if (counts.ok) parts.push(`${counts.ok} ok`);
  if (counts.none) parts.push(`${counts.none} sin señal`);

  return { status, summary: parts.join(" · "), checks };
});

/** The Pulso "qué arreglar hoy" pick: worst failing check, if any. */
export function firstActionable(report: HealthReport): HealthCheck | null {
  return (
    report.checks.find((c) => c.status === "bad") ??
    report.checks.find((c) => c.status === "warn") ??
    null
  );
}
