import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BackButton } from "@/components/ui";
import { tintSurfaceVertical } from "@/components/kura/tint";
import { getRecapMonths } from "@/modules/backlog/recap";
import { monthName, monthOf, monthYear, shortYear } from "@/modules/backlog/recap-format";
import { getRenderInstant } from "@/modules/catalog/release";
import { RecapStats } from "../recap-stats";

/**
 * O8 Meses anteriores (Kura, flujo 10 — a branch of Recap). The screen says
 * what it is (critique 2026-09-27): the h1 is "meses anteriores" (Newsreader
 * roman 40), then the newest month as a labelled block — "este mes" when it
 * is the month in progress, else its name — with the SAME four numbers as the
 * recap (`RecapStats`), leading to its recap; then every older month as a
 * miniature (108×192, tinted by its own "lo más tuyo", the cover and the
 * month). No rotated "tus recaps" spine and no "KURA" on each miniature: those
 * belong to the exportable card, not to a screen inside the app.
 */
export default async function RecapMonthsPage() {
  const user = await requireUser();
  const [months, now] = await Promise.all([getRecapMonths(user.id), getRenderInstant()]);
  const [latest, ...older] = months;
  if (!latest) redirect("/recap");
  const current = latest.key === monthOf(new Date(now));

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <BackButton href="/recap" className="h-11! w-11!" />
      </div>
      <h1 className="px-5 pt-4 font-brand text-[40px] leading-none text-text">meses anteriores</h1>

      <Link
        href={`/recap?mes=${latest.key}`}
        className="mx-5 mt-[22px] flex flex-col gap-3 rounded-[var(--r-surface)] bg-surface-1 p-4 bl-press-lg"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">
          {current ? "este mes" : "tu último mes"} · {monthName(latest.key)} {shortYear(latest.key)}
        </span>
        <RecapStats month={latest} size={32} />
      </Link>

      <section className="flex flex-col gap-3 px-5 pb-[60px] pt-8">
        {older.length === 0 ? (
          <p className="text-[15px] leading-[1.5] text-text-2">
            Este es tu primer mes. Los anteriores se guardan aquí.
          </p>
        ) : (
          <div className="bl-scroll -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-2">
            {older.map((m) => (
              <Link
                key={m.key}
                href={`/recap?mes=${m.key}`}
                aria-label={`Recap de ${monthYear(m.key)}`}
                className="flex h-48 w-[108px] flex-none flex-col items-center justify-end gap-3 overflow-hidden rounded-[var(--r-cover-l)] px-2.5 py-3.5 shadow-cover bl-press-lg"
                style={{ background: tintSurfaceVertical(m.top?.paletteHex ?? []) }}
              >
                {m.top?.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                  <img src={m.top.posterUrl} alt="" loading="lazy" className="h-16 w-16 rounded-[var(--r-cover-s)] object-cover" />
                ) : (
                  <span className="h-16 w-16 rounded-[var(--r-cover-s)] bg-surface-2" />
                )}
                <span className="flex flex-col items-center gap-1">
                  <span className="font-brand text-[18px] leading-none text-text">{monthName(m.key)}</span>
                  <span className="font-mono text-[10px] tracking-[0.08em] text-text-2">{shortYear(m.key)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
