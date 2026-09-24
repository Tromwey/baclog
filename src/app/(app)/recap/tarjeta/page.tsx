import { requireUser } from "@/auth";
import { buildLatestRecap, buildMonthlyRecap } from "@/modules/backlog/recap";
import { CardExporter } from "@/components/card-exporter";
import { BackButton } from "@/components/ui";
import { monthName, monthYear } from "../recap-data";

/**
 * 66 Tarjeta recap / 67 C2 Tarjeta firmada — the Kura frame around the
 * F3.3/F3.5.7 recap card: Volver 44 at the top, the mono eyebrow, and the
 * UNTOUCHED exporter (the pattern card, drawn by modules/cards — its
 * renderer is not redesigned in this pass; the export stays ADR-008: palette
 * and type, no artwork). The card's title is the Kura name of the month,
 * "recap de agosto", and your public link signs it when your page is live.
 */
export default async function RecapCardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const recap =
    (mes && /^\d{4}-\d{2}$/.test(mes)
      ? await buildMonthlyRecap(user.id, mes, user.username)
      : null) ?? (await buildLatestRecap(user.id, user.username));

  if (!recap) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-bg px-6 pb-dock-clearance pt-[calc(16px+env(safe-area-inset-top))] text-text">
        <BackButton href="/recap" className="h-11! w-11!" />
        <h1 className="pt-10 font-brand text-[32px] leading-[1.1] text-text">todavía no hay tarjeta.</h1>
        <p className="text-[15px] leading-[1.5] text-text-2">
          Guarda, completa o reseña algo y tu recap del mes aparece aquí.
        </p>
      </main>
    );
  }

  const label = `recap de ${monthName(recap.eraKey)}`;
  return (
    <div className="relative">
      <div className="absolute left-6 top-[calc(16px+env(safe-area-inset-top))] z-10">
        <BackButton className="h-11! w-11!" />
      </div>
      <CardExporter
        backlog={{ ...recap.cardBacklog, name: label }}
        style="pattern"
        eyebrow={`recap · ${monthYear(recap.eraKey)}`}
        subtitle={`${recap.completedCount} ${recap.completedCount === 1 ? "completo" : "completos"} · ${recap.totalItems} ${recap.totalItems === 1 ? "título" : "títulos"}${
          recap.topGenre ? ` · ${recap.topGenre}` : ""
        }`}
        publicUrl={user.username && user.isPublic ? `https://baclog.app/${user.username}` : null}
        noLinkNote="Elige tu @usuario en Ajustes para que tu link firme la tarjeta."
      />
    </div>
  );
}
