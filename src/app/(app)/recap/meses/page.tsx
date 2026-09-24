import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { BackButton } from "@/components/ui";
import { tintSurfaceVertical } from "@/components/kura/tint";
import { getRecapMonths } from "@/modules/backlog/recap";
import { monthName, monthYear } from "@/modules/backlog/recap-format";

/**
 * O8 Meses anteriores (Kura, flujo 10 — a branch of Recap): the newest
 * month on top in Newsreader 40 with its three tiles (`--s1`, radius 18,
 * number in Newsreader 28 + mono label), then "meses anteriores" as one
 * collection-shaped card (spine "tus recaps") of 108×192 miniatures, each
 * tinted by its own "lo más tuyo" and leading to that month's recap.
 *
 * The mock's third tile ("31 h de cine") needs runtimes the catalog doesn't
 * store; the product counts reviews there instead.
 */
export default async function RecapMonthsPage() {
  const user = await requireUser();
  const months = await getRecapMonths(user.id);
  const [latest, ...older] = months;
  if (!latest) redirect("/recap");

  const tiles = [
    { v: latest.completed, l: "completos" },
    { v: latest.obsessions, l: "obsesiones" },
    { v: latest.reviews, l: "reseñas" },
  ];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <BackButton href="/recap" className="h-11! w-11!" />
      </div>
      <div className="flex flex-col gap-1.5 px-5 pt-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          recap · {monthYear(latest.key)}
        </span>
        <h1 className="font-brand text-[40px] leading-none text-text">{monthName(latest.key)}</h1>
      </div>
      <Link href={`/recap?mes=${latest.key}`} className="mx-5 mt-[18px] flex gap-2.5 bl-press-lg">
        {tiles.map((t) => (
          <span key={t.l} className="flex flex-1 flex-col gap-1 rounded-[var(--r-surface)] bg-surface-1 p-4">
            <span className="font-brand text-[28px] leading-none text-text">{t.v}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">{t.l}</span>
          </span>
        ))}
      </Link>

      <section className="flex flex-col gap-3 px-3 pb-[60px] pt-10">
        <h2 className="px-2 font-brand text-[24px] leading-[1.1] text-text">meses anteriores</h2>
        {older.length === 0 ? (
          <p className="px-2 text-[15px] leading-[1.5] text-text-2">
            Este es tu primer mes. Los anteriores se guardan aquí.
          </p>
        ) : (
          <div className="flex overflow-hidden rounded-[var(--r-screen)] bg-surface-1">
            <span className="flex w-10 flex-none items-center justify-center bg-black/[0.24]">
              <span
                className="whitespace-nowrap font-mono text-[13px] tracking-[0.14em] text-text"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                tus recaps
              </span>
            </span>
            <div className="bl-scroll flex flex-1 gap-2.5 overflow-x-auto px-4 py-[18px]">
              {older.map((m) => (
                <Link
                  key={m.key}
                  href={`/recap?mes=${m.key}`}
                  aria-label={`Recap de ${monthYear(m.key)}`}
                  className="flex h-48 w-[108px] flex-none flex-col items-center justify-between overflow-hidden rounded-[var(--r-cover-l)] px-2.5 py-3.5 shadow-cover bl-press-lg"
                  style={{ background: tintSurfaceVertical(m.top?.paletteHex ?? []) }}
                >
                  <span className="font-mono text-[10px] tracking-[0.1em] text-text-2">KURA</span>
                  {m.top?.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                    <img src={m.top.posterUrl} alt="" loading="lazy" className="h-16 w-16 rounded-[var(--r-cover-s)] object-cover" />
                  ) : (
                    <span className="h-16 w-16 rounded-[var(--r-cover-s)] bg-surface-2" />
                  )}
                  <span className="font-brand text-[18px] leading-none text-text">{monthName(m.key)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
