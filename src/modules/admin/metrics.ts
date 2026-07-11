import "server-only";
import { cache } from "react";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  backlogs,
  crossMediaRecs,
  crossMediaRecUsage,
  crossMediaRecoFeedback,
  llmCallLog,
  userItems,
  users,
} from "@/db/schema";
import {
  POSITIVE_REASONS,
  REASON_LABEL,
} from "@/modules/recs/feedback-reasons";
import {
  MONTHLY_GENERATION_CAP,
  eraKey as currentEraKey,
} from "@/modules/recs/crossmedia";
import { getGeoDeviceBreakdown } from "@/modules/analytics/aggregate";
import { fixedMonthlyCostUsd, llmCostUsd } from "./costs";

export { currentEraKey };

/**
 * Torre de Control — read-side aggregations for the founder portal. Pure
 * queries, no mutations. Everything here answers one of two questions: "¿vamos
 * bien hacia el gate de tracción?" (M2: ~50 usuarios compartiendo) or "¿qué
 * arreglo hoy?" (checks.ts consumes the window helpers at the bottom).
 *
 * Volume note: the app is pre-traction (double-digit users), so several
 * aggregations deliberately fetch-and-fold in JS instead of fighting SQL —
 * the same posture as recs/metrics.ts.
 */

/** M2 traction gate: users who shared ≥1 card in the last 30 days. */
export const TRACTION_GATE_GOAL = 50;
/** F3.2 founder cohort seats (organic first-100, ranked). */
export const FOUNDER_COHORT_GOAL = 100;

/** Monday-start UTC week bucket for a date (matches SQL date_trunc('week')). */
function weekStartUTC(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** The last `n` week starts (oldest first), ending in the current week. */
function lastWeekStarts(n: number): Date[] {
  const cur = weekStartUTC(new Date());
  return Array.from(
    { length: n },
    (_, i) => new Date(cur.getTime() - (n - 1 - i) * 7 * 86_400_000),
  );
}

const wkKey = (d: Date) => d.toISOString().slice(0, 10);

/** Distinct users with any library mutation or captured event in a window. */
async function activeUserCount(days: number): Promise<number> {
  const [itemActive, eventActive] = await Promise.all([
    db
      .selectDistinct({ userId: userItems.userId })
      .from(userItems)
      .where(
        sql`greatest(${userItems.addedAt}, ${userItems.statusChangedAt}, coalesce(${userItems.verdictChangedAt}, 'epoch'::timestamp), coalesce(${userItems.obsessedAt}, 'epoch'::timestamp)) > now() - make_interval(days => ${days})`,
      ),
    db
      .selectDistinct({ userId: analyticsEvents.userId })
      .from(analyticsEvents)
      .where(
        and(
          isNotNull(analyticsEvents.userId),
          sql`${analyticsEvents.createdAt} > now() - make_interval(days => ${days})`,
        ),
      ),
  ]);
  const ids = new Set<string>();
  for (const r of itemActive) ids.add(r.userId);
  for (const r of eventActive) if (r.userId) ids.add(r.userId);
  return ids.size;
}

/** Users who shared ≥1 card in the last 30 days — THE gate metric.
 *  React-cached: checks.ts and getPulsoMetrics both need it in one request. */
export const gateProgress = cache(async (): Promise<number> => {
  const [row] = await db
    .select({
      c: sql<number>`count(distinct ${analyticsEvents.userId})`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventType, "card_share"),
        isNotNull(analyticsEvents.userId),
        sql`${analyticsEvents.createdAt} > now() - interval '30 days'`,
      ),
    );
  return row?.c ?? 0;
});

/** Estimated month-to-date LLM spend (tokens × list price, per model).
 *  React-cached: the burn check and the Pulso tiles share one execution. */
export const llmCostMonthUsd = cache(async (): Promise<number> => {
  const rows = await db
    .select({
      model: llmCallLog.model,
      input: sql<number>`coalesce(sum(${llmCallLog.inputTokens}), 0)`.mapWith(Number),
      output: sql<number>`coalesce(sum(${llmCallLog.outputTokens}), 0)`.mapWith(Number),
    })
    .from(llmCallLog)
    .where(sql`${llmCallLog.createdAt} >= date_trunc('month', now())`)
    .groupBy(llmCallLog.model);
  return rows.reduce((s, r) => s + llmCostUsd(r.model, r.input, r.output), 0);
});

// ---------- Pulso ----------

export interface PulsoMetrics {
  totalUsers: number;
  newUsers7d: number;
  activeUsers7d: number;
  /** Cumulative user count at the end of each of the last 7 weeks. */
  usersSpark: number[];
  recoGenerationsMonth: number;
  llmCostMonthUsd: number;
  fixedCostMonthUsd: number;
  gateCurrent: number;
  gateGoal: number;
}

export async function getPulsoMetrics(): Promise<PulsoMetrics> {
  const era = currentEraKey();
  const [
    [total],
    [new7],
    active7,
    gateCurrent,
    [recoMonth],
    llmCost,
    weeklyRows,
  ] = await Promise.all([
    db.select({ c: count() }).from(users),
    db
      .select({ c: count() })
      .from(users)
      .where(sql`${users.createdAt} > now() - interval '7 days'`),
    activeUserCount(7),
    gateProgress(),
    db
      .select({
        c: sql<number>`coalesce(sum(${crossMediaRecUsage.generations}), 0)`.mapWith(Number),
      })
      .from(crossMediaRecUsage)
      .where(eq(crossMediaRecUsage.eraKey, era)),
    llmCostMonthUsd(),
    db
      .select({
        wk: sql<string>`to_char(date_trunc('week', ${users.createdAt}), 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(users)
      .groupBy(sql`date_trunc('week', ${users.createdAt})`)
      .orderBy(sql`date_trunc('week', ${users.createdAt})`),
  ]);

  // Cumulative library growth per week — the tile sparkline.
  const weeks = lastWeekStarts(7).map(wkKey);
  const usersSpark: number[] = [];
  let running = 0;
  let ptr = 0;
  for (const week of weeks) {
    while (ptr < weeklyRows.length && weeklyRows[ptr].wk <= week) {
      running += Number(weeklyRows[ptr].c);
      ptr += 1;
    }
    usersSpark.push(running);
  }

  return {
    totalUsers: total?.c ?? 0,
    newUsers7d: new7?.c ?? 0,
    activeUsers7d: active7,
    usersSpark,
    recoGenerationsMonth: recoMonth?.c ?? 0,
    llmCostMonthUsd: llmCost,
    fixedCostMonthUsd: fixedMonthlyCostUsd(),
    gateCurrent,
    gateGoal: TRACTION_GATE_GOAL,
  };
}

// ---------- Usuarios ----------

export interface UsuariosMetrics {
  totalUsers: number;
  /** Signups per week, oldest first (7 buckets, gaps filled with 0). */
  weekly: { label: string; count: number }[];
  cohortCurrent: number;
  cohortGoal: number;
  /** Activation funnel, top → bottom. */
  funnel: { name: string; value: number }[];
  /** Distinct signed-in users per country (session signal), top 6. */
  countries: { name: string; value: number }[];
}

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });

export function countryLabel(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export async function getUsuariosMetrics(): Promise<UsuariosMetrics> {
  const [
    [total],
    weeklyRows,
    [cohort],
    [withBacklog],
    [withItem],
    [reacted],
    [shared],
    countryRows,
  ] = await Promise.all([
    db.select({ c: count() }).from(users),
    db
      .select({
        wk: sql<string>`to_char(date_trunc('week', ${users.createdAt}), 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(users)
      .where(sql`${users.createdAt} > now() - interval '49 days'`)
      .groupBy(sql`date_trunc('week', ${users.createdAt})`),
    db
      .select({ c: count() })
      .from(users)
      .where(isNotNull(users.founderRank)),
    db
      .select({ c: sql<number>`count(distinct ${backlogs.userId})`.mapWith(Number) })
      .from(backlogs),
    db
      .select({ c: sql<number>`count(distinct ${userItems.userId})`.mapWith(Number) })
      .from(userItems),
    db
      .select({ c: sql<number>`count(distinct ${userItems.userId})`.mapWith(Number) })
      .from(userItems)
      .where(sql`${userItems.verdict} is not null or ${userItems.obsessed}`),
    db
      .select({
        c: sql<number>`count(distinct ${analyticsEvents.userId})`.mapWith(Number),
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, "card_share"),
          isNotNull(analyticsEvents.userId),
        ),
      ),
    db
      .select({
        country: analyticsEvents.country,
        c: sql<number>`count(distinct ${analyticsEvents.userId})`.mapWith(Number),
      })
      .from(analyticsEvents)
      .where(
        and(isNotNull(analyticsEvents.userId), isNotNull(analyticsEvents.country)),
      )
      .groupBy(analyticsEvents.country)
      .orderBy(desc(sql`count(distinct ${analyticsEvents.userId})`))
      .limit(6),
  ]);

  const byWeek = new Map(weeklyRows.map((r) => [r.wk, Number(r.c)]));
  const weekly = lastWeekStarts(7).map((d) => ({
    label: d.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
    count: byWeek.get(wkKey(d)) ?? 0,
  }));

  return {
    totalUsers: total?.c ?? 0,
    weekly,
    cohortCurrent: cohort?.c ?? 0,
    cohortGoal: FOUNDER_COHORT_GOAL,
    funnel: [
      { name: "Registro", value: total?.c ?? 0 },
      { name: "Crea backlog", value: withBacklog?.c ?? 0 },
      { name: "Agrega ítem", value: withItem?.c ?? 0 },
      { name: "Reacciona", value: reacted?.c ?? 0 },
      { name: "Comparte", value: shared?.c ?? 0 },
    ],
    countries: countryRows.map((r) => ({
      name: countryLabel(r.country ?? "??"),
      value: r.c,
    })),
  };
}

// ---------- Tráfico ----------

const TRAFFIC_EVENT_LABEL = {
  public_profile_view: "Vistas de perfil",
  public_backlog_view: "Vistas de backlog",
  public_item_view: "Vistas de ítem",
  card_share: "Shares de tarjeta",
} as const;

type TrafficEventType = keyof typeof TRAFFIC_EVENT_LABEL;
const TRAFFIC_EVENT_TYPES = Object.keys(TRAFFIC_EVENT_LABEL) as TrafficEventType[];

export interface TraficoMetrics {
  /** Per event type: weekly counts over the last 6 weeks + window total. */
  events: { name: string; series: number[]; total: number }[];
  /** País × dispositivo, top countries first; desktop/other fold into web. */
  devices: { name: string; ios: number; android: number; web: number }[];
}

export async function getTraficoMetrics(): Promise<TraficoMetrics> {
  const [eventRows, deviceRows] = await Promise.all([
    db
      .select({
        eventType: analyticsEvents.eventType,
        wk: sql<string>`to_char(date_trunc('week', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`,
        c: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          inArray(analyticsEvents.eventType, TRAFFIC_EVENT_TYPES),
          sql`${analyticsEvents.createdAt} > now() - interval '42 days'`,
        ),
      )
      .groupBy(
        analyticsEvents.eventType,
        sql`date_trunc('week', ${analyticsEvents.createdAt})`,
      ),
    // The canonical F3.4 geo×device aggregation — same helper the old
    // /admin/analytics table read, so the ADR-000 signal has one definition.
    getGeoDeviceBreakdown(),
  ]);

  const weeks = lastWeekStarts(6).map(wkKey);
  const events = TRAFFIC_EVENT_TYPES.map((type) => {
    const series = weeks.map((week) => {
      const row = eventRows.find((r) => r.eventType === type && r.wk === week);
      return row ? Number(row.c) : 0;
    });
    return {
      name: TRAFFIC_EVENT_LABEL[type],
      series,
      total: series.reduce((a, b) => a + b, 0),
    };
  });

  const byCountry = new Map<
    string,
    { ios: number; android: number; web: number }
  >();
  for (const r of deviceRows) {
    const key = r.country ?? "??";
    const bucket = byCountry.get(key) ?? { ios: 0, android: 0, web: 0 };
    const n = Number(r.count);
    if (r.device === "ios") bucket.ios += n;
    else if (r.device === "android") bucket.android += n;
    else bucket.web += n;
    byCountry.set(key, bucket);
  }
  const ranked = [...byCountry.entries()].sort(
    (a, b) =>
      b[1].ios + b[1].android + b[1].web - (a[1].ios + a[1].android + a[1].web),
  );
  const top = ranked.slice(0, 4).map(([code, v]) => ({
    name: code === "??" ? "Desconocido" : countryLabel(code),
    ...v,
  }));
  const rest = ranked.slice(4);
  if (rest.length > 0) {
    top.push(
      rest.reduce(
        (acc, [, v]) => ({
          name: acc.name,
          ios: acc.ios + v.ios,
          android: acc.android + v.android,
          web: acc.web + v.web,
        }),
        { name: "Resto", ios: 0, android: 0, web: 0 },
      ),
    );
  }

  return { events, devices: top };
}

// ---------- Recos ----------

export interface RecosMetrics {
  /** Provider/model call mix this month (llm_call_log), busiest first. */
  monthModels: { provider: string; model: string; calls: number }[];
  /** Fallback model stamp when telemetry has no rows yet (pre-0015 recos). */
  latestModel: { provider: string; model: string | null } | null;
  /** Charged generations this month (the ADR-009 usage meter). */
  generationsMonth: number;
  /** LLM-stage failure share over 30d of telemetry (null = sin señal). */
  failRate30d: number | null;
  calls30d: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  acceptance: { accepted: number; total: number };
  feedbackPositive: { label: string; count: number }[];
  feedbackNegative: { label: string; count: number }[];
  cappedUsers: number;
  generationCap: number;
}

export async function getRecosMetrics(): Promise<RecosMetrics> {
  const era = currentEraKey();
  const [
    monthModels,
    [latest],
    [genMonth],
    [llmWindow],
    [recTotal],
    [accepted],
    feedbackRows,
    [capped],
  ] = await Promise.all([
    db
      .select({
        provider: llmCallLog.provider,
        model: llmCallLog.model,
        calls: count(),
      })
      .from(llmCallLog)
      .where(sql`${llmCallLog.createdAt} >= date_trunc('month', now())`)
      .groupBy(llmCallLog.provider, llmCallLog.model)
      .orderBy(desc(count())),
    db
      .select({ provider: crossMediaRecs.provider, model: crossMediaRecs.model })
      .from(crossMediaRecs)
      .orderBy(desc(crossMediaRecs.createdAt))
      .limit(1),
    db
      .select({
        c: sql<number>`coalesce(sum(${crossMediaRecUsage.generations}), 0)`.mapWith(Number),
      })
      .from(crossMediaRecUsage)
      .where(eq(crossMediaRecUsage.eraKey, era)),
    db
      .select({
        total: count(),
        // Provider failures only — moderation_rejected is our own screen
        // refusing usable output, not a provider incident (see checks.ts).
        failures:
          sql<number>`count(*) filter (where ${llmCallLog.outcome} = 'transient')`.mapWith(Number),
        p50: sql<string | null>`percentile_cont(0.5) within group (order by ${llmCallLog.latencyMs})`,
        p95: sql<string | null>`percentile_cont(0.95) within group (order by ${llmCallLog.latencyMs})`,
      })
      .from(llmCallLog)
      .where(sql`${llmCallLog.createdAt} > now() - interval '30 days'`),
    db.select({ c: count() }).from(crossMediaRecs),
    // DISTINCT recs, not user_item rows: cross_media_rec is a shared
    // cross-user cache, so two users accepting the same cached reco must
    // count it once — otherwise acceptance can exceed 100%.
    db
      .select({
        c: sql<number>`count(distinct ${userItems.sourceCrossMediaRecId})`.mapWith(Number),
      })
      .from(userItems)
      .where(isNotNull(userItems.sourceCrossMediaRecId)),
    // Chip polarity folded in JS — same posture as recs/metrics.ts.
    db
      .select({ reasons: crossMediaRecoFeedback.reasons })
      .from(crossMediaRecoFeedback),
    db
      .select({ c: count() })
      .from(crossMediaRecUsage)
      .where(
        and(
          eq(crossMediaRecUsage.eraKey, era),
          sql`${crossMediaRecUsage.generations} >= ${MONTHLY_GENERATION_CAP}`,
        ),
      ),
  ]);

  const positive = new Set<string>(POSITIVE_REASONS);
  const tally = new Map<string, number>();
  for (const row of feedbackRows) {
    for (const reason of row.reasons) {
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    }
  }
  const toRanked = (filter: (r: string) => boolean) =>
    [...tally.entries()]
      .filter(([r]) => filter(r))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([r, c]) => ({ label: REASON_LABEL[r] ?? r, count: c }));

  const calls30d = llmWindow?.total ?? 0;
  return {
    monthModels: monthModels.map((m) => ({
      provider: m.provider,
      model: m.model,
      calls: Number(m.calls),
    })),
    latestModel: latest ? { provider: latest.provider, model: latest.model } : null,
    generationsMonth: genMonth?.c ?? 0,
    failRate30d: calls30d > 0 ? (llmWindow?.failures ?? 0) / calls30d : null,
    calls30d,
    latencyP50Ms: llmWindow?.p50 == null ? null : Number(llmWindow.p50),
    latencyP95Ms: llmWindow?.p95 == null ? null : Number(llmWindow.p95),
    acceptance: { accepted: accepted?.c ?? 0, total: recTotal?.c ?? 0 },
    feedbackPositive: toRanked((r) => positive.has(r)),
    feedbackNegative: toRanked((r) => !positive.has(r)),
    cappedUsers: capped?.c ?? 0,
    generationCap: MONTHLY_GENERATION_CAP,
  };
}

// ---------- Salud (window helpers consumed by checks.ts) ----------

export interface LlmHealthWindow {
  total: number;
  /** Provider failures (outcome = 'transient') — 429/network/unusable output. */
  failures: number;
  /** Rejections by OUR deterministic moderation screen — a prompt signal. */
  moderated: number;
  p95Ms: number | null;
}

/** LLM telemetry over the last `hours` hours (failure rate + p95). */
export async function llmHealthWindow(hours: number): Promise<LlmHealthWindow> {
  const [row] = await db
    .select({
      total: count(),
      failures:
        sql<number>`count(*) filter (where ${llmCallLog.outcome} = 'transient')`.mapWith(Number),
      moderated:
        sql<number>`count(*) filter (where ${llmCallLog.outcome} = 'moderation_rejected')`.mapWith(Number),
      p95: sql<string | null>`percentile_cont(0.95) within group (order by ${llmCallLog.latencyMs})`,
    })
    .from(llmCallLog)
    .where(sql`${llmCallLog.createdAt} > now() - make_interval(hours => ${hours})`);
  return {
    total: row?.total ?? 0,
    failures: row?.failures ?? 0,
    moderated: row?.moderated ?? 0,
    p95Ms: row?.p95 == null ? null : Number(row.p95),
  };
}

/** Captured events this week vs. the week before (traffic-drop check). */
export async function trafficWeekOverWeek(): Promise<{
  current: number;
  previous: number;
}> {
  const [row] = await db
    .select({
      current:
        sql<number>`count(*) filter (where ${analyticsEvents.createdAt} > now() - interval '7 days')`.mapWith(Number),
      previous:
        sql<number>`count(*) filter (where ${analyticsEvents.createdAt} <= now() - interval '7 days')`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(sql`${analyticsEvents.createdAt} > now() - interval '14 days'`);
  return { current: row?.current ?? 0, previous: row?.previous ?? 0 };
}
