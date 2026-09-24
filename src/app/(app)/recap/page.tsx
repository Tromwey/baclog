import Link from "next/link";
import { requireUser } from "@/auth";
import { getRenderInstant } from "@/modules/catalog/release";
import { BackButton } from "@/components/ui";
import { BOOKMARK_PATH, CHECK_FILL_PATH, FLAME_PATH, REVIEW_PATH } from "@/components/glyph-paths";
import { Cover, GLASS_BUTTON } from "@/components/kura/components";
import { tintCard } from "@/components/kura/tint";
import { getRecapMonths, type RecapMonth } from "@/modules/backlog/recap";
import { alsoInMonth, monthName, monthYear } from "@/modules/backlog/recap-format";

/**
 * 65 Recap (Kura, flujo 10) — the month on a surface tinted by "lo más
 * tuyo": "RECAP · AGOSTO 2026" in mono between Volver and nothing, the month
 * in Newsreader italic 64, the title that was most yours, the 2×2 of the
 * month (number in Newsreader 48, glyph + mono label), "también en tu mes",
 * and Compartir tarjeta (glass) + Meses anteriores.
 *
 * Same month the F3.3 recap draws: the newest month with any activity (the
 * one in progress included), or `?mes=YYYY-MM` from Meses anteriores. The
 * exported card itself is the untouched F3.3/F3.5.7 pattern card, one tap
 * away (/recap/tarjeta).
 *
 * 69 Recap vacío is the state with no month at all.
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser();
  const [{ mes }, months, now] = await Promise.all([
    searchParams,
    getRecapMonths(user.id),
    getRenderInstant(),
  ]);

  const month = months.find((m) => m.key === mes) ?? months[0];
  if (!month) return <EmptyRecap now={now} />;

  const top = month.top;
  const more = alsoInMonth(month);
  const surface = top && top.paletteHex.length > 0 ? tintCard(top.paletteHex) : "var(--bg)";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md text-text" style={{ background: surface }}>
      <div className="flex flex-col gap-[22px] px-6 pb-dock-clearance pt-[calc(16px+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <BackButton className="h-11! w-11!" />
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">
            recap · {monthYear(month.key)}
          </span>
          <span className="w-11" aria-hidden />
        </div>

        <h1 className="font-brand text-[64px] italic leading-[0.96] text-text">{monthName(month.key)}</h1>

        {top && (
          <Link href={`/item/${top.catalogItemId}`} className="flex items-end gap-4 bl-press-lg">
            <Cover
              posterUrl={top.posterUrl}
              paletteHex={top.paletteHex}
              mediaType={top.mediaType}
              alt={top.title}
              style={{ width: top.mediaType === "album" ? 170 : 128 }}
            />
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">lo más tuyo</span>
              <span className="font-brand text-[26px] italic leading-[1.05] text-text [overflow-wrap:anywhere]">
                {top.title}
              </span>
              {top.byline && <span className="text-[14px] text-text-2">{top.byline}</span>}
            </span>
          </Link>
        )}

        <Stats month={month} />

        {more.length > 0 && (
          <section className="flex flex-col gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-2">también en tu mes</span>
            <div className="bl-scroll -mx-6 flex items-end gap-2.5 overflow-x-auto px-6 pb-4">
              {more.map((t) => (
                <Link key={t.catalogItemId} href={`/item/${t.catalogItemId}`} className="block flex-none bl-press-lg">
                  <Cover
                    posterUrl={t.posterUrl}
                    paletteHex={t.paletteHex}
                    mediaType={t.mediaType}
                    alt={t.title}
                    radius="rounded-[var(--r-cover-s)]"
                    className="h-24"
                  />
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={`/recap/tarjeta?mes=${month.key}`} className={`${GLASS_BUTTON} h-12 px-5`}>
            Compartir tarjeta
          </Link>
          {months.length > 1 && (
            <Link
              href="/recap/meses"
              className="inline-flex h-12 items-center px-4 text-[15px] font-semibold text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
            >
              Meses anteriores
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function Stats({ month }: { month: RecapMonth }) {
  const stats = [
    { v: month.completed, l: "completos", d: CHECK_FILL_PATH, c: "var(--st-completed)" },
    { v: month.obsessions, l: "obsesiones", d: FLAME_PATH, c: "var(--st-obsessed)" },
    { v: month.reviews, l: "reseñas", d: REVIEW_PATH, c: "var(--text)" },
    { v: month.saved, l: "guardados", d: BOOKMARK_PATH, c: "var(--text-2)" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-[18px] py-1.5">
      {stats.map((s) => (
        <div key={s.l} className="flex flex-col gap-1">
          <span className="font-brand text-[48px] leading-none text-text">{s.v}</span>
          <span className="flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill={s.c} aria-hidden className="flex-none">
              <path d={s.d} />
            </svg>
            {s.l}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * 69 Recap vacío — no month has anything yet. The sentence says when the
 * recap arrives and what fills it; the only way out is the collections.
 */
function EmptyRecap({ now }: { now: number }) {
  const d = new Date(now);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const days = Math.max(1, Math.ceil((next - now) / 86_400_000));
  const nextName = monthName(
    `${new Date(next).getUTCFullYear()}-${String(new Date(next).getUTCMonth() + 1).padStart(2, "0")}`,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-[22px] bg-bg px-6 pb-dock-clearance pt-[calc(16px+env(safe-area-inset-top))] text-text">
      <div className="flex items-center justify-between">
        <BackButton className="h-11! w-11!" />
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3">recap · {monthYear(key)}</span>
        <span className="w-11" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="flex gap-2.5" aria-hidden>
          <span className="aspect-[2/3] w-[84px] rounded-[var(--r-cover-s)] bg-surface-2" />
          <span className="aspect-[2/3] w-[84px] rounded-[var(--r-cover-s)] bg-surface-1" />
          <span className="aspect-[2/3] w-[84px] rounded-[var(--r-cover-s)] bg-surface-1 opacity-50" />
        </div>
        <h1 className="font-brand text-[44px] italic leading-none text-text text-balance">
          tu recap de {monthName(key)} todavía se está escribiendo.
        </h1>
        <p className="text-[15px] leading-[1.5] text-pretty text-text-2">
          El recap llega el 1 de {nextName} con lo que guardes, completes o reseñes este mes.
        </p>
        <span className="font-mono text-[12px] text-text-2">
          {days === 1 ? "Falta 1 día" : `Faltan ${days} días`}
        </span>
      </div>
      <Link href="/backlogs" className={`${GLASS_BUTTON} h-12 self-start px-5`}>
        Ir a tus colecciones
      </Link>
    </main>
  );
}
