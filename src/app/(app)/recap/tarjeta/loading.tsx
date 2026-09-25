import { SKELETON_PULSE } from "@/components/kura/components";
import { CardExporterSkeleton } from "@/components/card-exporter-skeleton";

/**
 * 66 Tarjeta recap: the page's frame — Volver 44 at left-6 / 16 + safe area,
 * over the exporter — and the exporter's silhouette with its header (eyebrow
 * + subtitle). Draws the card case, not the "todavía no hay tarjeta" one:
 * almost every visit has a recap.
 */
export default function Loading() {
  return (
    <div className="relative">
      <span
        className={`absolute left-6 top-[calc(16px+env(safe-area-inset-top))] z-10 h-11 w-11 rounded-full bg-[var(--glass-bg)] ${SKELETON_PULSE}`}
      />
      <CardExporterSkeleton header />
    </div>
  );
}
