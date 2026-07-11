import type { ReactNode } from "react";
import type { CheckStatus } from "@/modules/admin/checks";

/**
 * Torre de Control — shared presentation primitives (Claude Design
 * "Torre de Control.dc.html"). All server-safe: flat surface fills, no
 * borders/glows (HANDOFF §7), Space Mono as the instrument voice.
 */

export const STATUS_TEXT_CLASS: Record<CheckStatus, string> = {
  ok: "text-accent",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-text-3",
};

export const STATUS_BG_CLASS: Record<CheckStatus, string> = {
  ok: "bg-accent",
  warn: "bg-warn",
  bad: "bg-bad",
  none: "bg-text-3",
};

/** Tinted wash behind the global health strip (per-status, muted). */
export const STATUS_WASH_CLASS: Record<CheckStatus, string> = {
  ok: "bg-[rgba(216,255,62,0.06)]",
  warn: "bg-[rgba(232,178,58,0.09)]",
  bad: "bg-[rgba(196,73,78,0.10)]",
  none: "bg-surface-1",
};

export function fmtUsd(n: number): string {
  return n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`;
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[16px] bg-surface-1 p-[15px] ${className}`}>
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-text-3">
      {children}
    </div>
  );
}

export function Dot({
  status,
  className = "h-2 w-2",
}: {
  status: CheckStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className} ${STATUS_BG_CLASS[status]}`}
    />
  );
}

/** Horizontal meter — track + fill, borderless. */
export function Bar({
  pct,
  fillClass = "bg-accent",
  heightClass = "h-2",
  className = "",
}: {
  pct: number;
  fillClass?: string;
  heightClass?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-full bg-surface-3 ${heightClass} ${className}`}
    >
      <div
        className={`h-full rounded-full ${fillClass}`}
        style={{ width: `${Math.min(100, Math.max(0, pct)).toFixed(1)}%` }}
      />
    </div>
  );
}

/** Polyline points for a mini sparkline (server-computed, design spark()). */
function sparkPoints(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  width = 64,
  height = 20,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparkPoints(values, width, height);
  if (!points) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width, height }}
      className={`shrink-0 overflow-visible ${className}`}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--text-2)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** One tile of the Pulso key-numbers grid. */
export function StatTile({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: string;
  sub: string;
  spark?: number[];
}) {
  return (
    <div className="rounded-[14px] bg-surface-1 px-[13px] pb-3 pt-[13px]">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-3">
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-[6px]">
        <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">
          {value}
        </span>
        {spark && spark.length > 1 && <Sparkline values={spark} width={62} />}
      </div>
      <div className="mt-[7px] font-mono text-[9.5px] tracking-[0.04em] text-text-3">
        {sub}
      </div>
    </div>
  );
}

/** Per-section failure state — the portal keeps standing, the card apologizes. */
export function SectionError({
  message = "No pudimos cargar esta sección. El resto sigue en pie.",
  retryHref,
}: {
  message?: string;
  retryHref: string;
}) {
  return (
    <div className="mt-[13px] flex items-start gap-[9px]">
      <Dot status="bad" className="mt-1 h-2 w-2" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-[1.4] text-text-2">{message}</div>
        <a
          href={retryHref}
          className="mt-[9px] inline-block rounded-full bg-surface-2 px-[15px] py-[9px] font-mono text-[11px] tracking-[0.06em] text-text"
        >
          REINTENTAR
        </a>
      </div>
    </div>
  );
}

/** Quiet empty copy inside a card ("aún sin señal de mercado."). */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-[13px] text-[13px] leading-[1.45] text-text-3">
      {children}
    </div>
  );
}

/** Skeleton for tab loading.tsx files (mirrors the design's Cargando frame). */
export function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-[6px]">
      <div className="h-[13px] w-[118px] rounded-[6px] bg-surface-2" />
      <div className="flex flex-col gap-3 rounded-[18px] bg-surface-1 p-[18px]">
        <div className="h-[11px] w-[120px] rounded-[5px] bg-surface-2" />
        <div className="h-[52px] w-[150px] rounded-[9px] bg-surface-2" />
        <div className="h-[9px] w-full rounded-full bg-surface-2" />
        <div className="h-[15px] w-[82%] rounded-[6px] bg-surface-2" />
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="h-24 rounded-[14px] bg-surface-1" />
        <div className="h-24 rounded-[14px] bg-surface-1" />
        <div className="h-24 rounded-[14px] bg-surface-1" />
        <div className="h-24 rounded-[14px] bg-surface-1" />
      </div>
      <div className="h-[104px] rounded-[14px] bg-surface-1" />
    </div>
  );
}
