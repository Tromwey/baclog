import type { ReactNode } from "react";
import { SKELETON_PULSE } from "@/components/kura/components";
import type { CheckStatus } from "@/modules/admin/checks";

/**
 * Torre de Control — shared presentation primitives (Claude Design
 * "Torre de Control.dc.html"). All server-safe: flat surface fills, no
 * borders/glows (HANDOFF §7), Red Hat Mono as the instrument voice.
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

/**
 * Pulso skeleton (admin/loading.tsx) — measured from page.tsx: the health
 * strip (rounded-[15px], ~62 tall), the traction hero with its own padding
 * (label, the 66px number, the 9px bar, the serif line, the mono footnote),
 * the six stat tiles (3 rows of 2) and "Qué arreglar hoy".
 */
export function AdminSkeleton() {
  return (
    <div className={`flex flex-col gap-3 pt-1 ${SKELETON_PULSE}`}>
      <div className="h-[62px] rounded-[15px] bg-surface-1" />
      <div className="rounded-[18px] bg-surface-1 px-4 pb-[17px] pt-[18px]">
        <div className="h-[10px] w-[168px] rounded-full bg-surface-2" />
        <div className="mt-[11px] h-[56px] w-[150px] rounded-[9px] bg-surface-2" />
        <div className="mt-[15px] h-[9px] w-full rounded-full bg-surface-2" />
        <div className="mt-[13px] h-[19px] w-[82%] rounded-[6px] bg-surface-2" />
        <div className="mt-[6px] h-[19px] w-[56%] rounded-[6px] bg-surface-2" />
        <div className="mt-[11px] h-[9px] w-[190px] rounded-full bg-surface-2" />
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-[14px] bg-surface-1" />
        ))}
      </div>
      <div className="h-[76px] rounded-[14px] bg-surface-1" />
    </div>
  );
}

/**
 * Generic tab skeleton: a stack of Card-shaped blocks (rounded-[16px],
 * p-[15px]) each with a CardLabel bar and a body bar. `bodies` sets each
 * card's body height; `tiles` inserts a row of N mini tiles (Recos' 3-up
 * grid) after the first card.
 */
export function CardStackSkeleton({
  bodies = [96, 120, 88],
  tiles,
}: {
  bodies?: number[];
  tiles?: number;
}) {
  const cards = bodies.map((h, i) => (
    <div key={`c${i}`} className="rounded-[16px] bg-surface-1 p-[15px]">
      <div className="h-[10px] w-[112px] rounded-full bg-surface-2" />
      <div
        className="mt-[14px] rounded-[9px] bg-surface-2"
        style={{ height: h }}
      />
    </div>
  ));
  if (tiles) {
    cards.splice(
      1,
      0,
      <div
        key="tiles"
        className="grid gap-[10px]"
        style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="h-[72px] rounded-[14px] bg-surface-1" />
        ))}
      </div>,
    );
  }
  return (
    <div className={`flex flex-col gap-3 pt-1 ${SKELETON_PULSE}`}>{cards}</div>
  );
}

/** Salud skeleton — the semáforo strip and one divide-y list of check rows. */
export function HealthListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className={`flex flex-col gap-3 pt-1 ${SKELETON_PULSE}`}>
      <div className="h-[62px] rounded-[15px] bg-surface-1" />
      <div className="divide-y divide-line overflow-hidden rounded-[16px] bg-surface-1">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-[11px] px-[15px] py-[14px]">
            <div className="mt-1 h-[9px] w-[9px] flex-none rounded-full bg-surface-2" />
            <div className="flex flex-1 flex-col gap-[9px]">
              <div className="h-[13px] w-[58%] rounded-full bg-surface-2" />
              <div className="h-[9px] w-[40%] rounded-full bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
