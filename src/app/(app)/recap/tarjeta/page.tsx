import { requireUser } from "@/auth";
import { getRecapMonths } from "@/modules/backlog/recap";
import { toRecapCardBacklog } from "@/modules/cards/adapter";
import { CardExporter } from "@/components/card-exporter";
import { BackButton } from "@/components/ui";
import { monthYear } from "@/modules/backlog/recap-format";

/**
 * 66 Tarjeta recap / 67 C2 Tarjeta firmada — the Kura frame around the recap
 * card: Volver 44 at the top, the mono eyebrow, and the exporter drawing
 * `render/recap.ts` (flujo 10 · Tarjeta: the month, the fan with "lo más
 * tuyo" in front, the month's numbers; ADR-008: palette and type, no
 * artwork). It reads the month the recap SCREEN reads (`getRecapMonths`:
 * `?mes=YYYY-MM`, else the newest), so the card's numbers are the screen's.
 * Your public link travels with it when your page is live.
 */
export default async function RecapCardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const [{ mes }, months] = await Promise.all([searchParams, getRecapMonths(user.id)]);
  const recap = months.find((m) => m.key === mes) ?? months[0];

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

  return (
    <div className="relative">
      <div className="absolute left-6 top-[calc(16px+env(safe-area-inset-top))] z-10">
        <BackButton className="h-11! w-11!" />
      </div>
      <CardExporter
        backlog={toRecapCardBacklog(recap, user.username)}
        style="recap"
        eyebrow={`recap · ${monthYear(recap.key)}`}
        publicUrl={user.username && user.isPublic ? `https://baclog.app/${user.username}` : null}
        noLinkNote="Elige tu @usuario en Ajustes para que tu link firme la tarjeta."
      />
    </div>
  );
}
