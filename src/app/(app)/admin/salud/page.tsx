import Link from "next/link";
import { fetched, requireAdmin } from "@/modules/admin/guard";
import {
  runHealthChecks,
  STATUS_WORD,
  type HealthCheck,
} from "@/modules/admin/checks";
import {
  Card,
  Dot,
  SectionError,
  STATUS_TEXT_CLASS,
  STATUS_WASH_CLASS,
} from "../ui";

/**
 * Salud — the deterministic check list. Each row: estado + valor medido y,
 * si falla, el action item concreto con dónde ejecutarlo. "Sin señal" (gris)
 * cuando no hay datos suficientes — nunca un verde falso.
 */
export default async function SaludPage() {
  await requireAdmin();
  const health = await fetched(runHealthChecks());

  if (!health.ok) {
    return (
      <div className="pt-1">
        <Card>
          <SectionError
            message="No pudimos correr los checks ahora mismo."
            retryHref="/admin/salud"
          />
        </Card>
      </div>
    );
  }

  const { status, summary, checks } = health.data;

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Semáforo global */}
      <div
        className={`flex items-center gap-3 rounded-[15px] px-[15px] py-[14px] ${STATUS_WASH_CLASS[status]}`}
      >
        <Dot status={status} className="h-[13px] w-[13px]" />
        <div className="min-w-0 flex-1">
          <div
            className={`font-mono text-[13.5px] font-bold tracking-[0.06em] ${STATUS_TEXT_CLASS[status]}`}
          >
            {STATUS_WORD[status]}
          </div>
          <div className="mt-[3px] font-mono text-[10.5px] tracking-[0.02em] text-text-2">
            {summary}
          </div>
        </div>
      </div>

      {/* Checks */}
      <div className="divide-y divide-line overflow-hidden rounded-[16px] bg-surface-1">
        {checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>

      <div className="px-1 py-[2px] text-center font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">
        Checks deterministas · evaluados al abrir esta pantalla
      </div>

      {/* Herramientas founder (nav-reachability para el backfill) */}
      <Link
        href="/admin/palette-backfill"
        className="flex items-center gap-3 rounded-[14px] bg-surface-1 px-[15px] py-[13px]"
      >
        <span className="flex-1 text-[13.5px] text-text">
          Herramienta · re-extraer paletas (ADN)
        </span>
        <span className="text-[16px] text-text-3">›</span>
      </Link>
    </div>
  );
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <div className="px-[15px] py-[14px]">
      <div className="flex items-start gap-[11px]">
        <Dot status={check.status} className="mt-1 h-[9px] w-[9px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-[10px]">
            <span className="text-[14px] text-text">{check.name}</span>
            <span
              className={`shrink-0 font-mono text-[9px] tracking-[0.06em] ${STATUS_TEXT_CLASS[check.status]}`}
            >
              {STATUS_WORD[check.status]}
            </span>
          </div>
          <div className="mt-[5px] font-mono text-[10.5px] tracking-[0.02em] text-text-3">
            {check.value}
          </div>
          {check.action && (
            <div className="mt-[10px] rounded-[10px] bg-surface-2 px-3 py-[11px]">
              <div className="text-[12.5px] leading-[1.45] text-text-2">
                → {check.action}
              </div>
              {check.where && (
                <div className="mt-[6px] font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-3">
                  {check.where}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
