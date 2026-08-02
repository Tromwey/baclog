import Link from "next/link";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import { requireAdmin } from "@/modules/admin/guard";
import { getRenderInstant } from "@/modules/catalog/release";
import { NovedadesModal } from "@/components/novedades-modal";

/**
 * Preview route for the F3.8 Novedades sheet — the three states side by side,
 * with the REAL component, the real Sheet and real catalog rows (covers,
 * artists, dates), so what's on screen is what ships.
 *
 * ADMIN-ONLY, and the guard is not decoration. The sheet's buttons call the
 * REAL server actions, so a signed-in visitor tapping "Entendido" here would
 * permanently spend their own F3.8 announcement (reset semantics are "bump the
 * constant", so it can't be handed back), and tapping "+ Seguir" would write a
 * real membership into their newest backlog. Sending someone this link would
 * quietly mutate their account. It only ever read as harmless because the
 * author was testing it logged out.
 *
 * Delete the route once the design is signed off — it is a viewing aid, not a
 * feature.
 */
export const dynamic = "force-dynamic";

export default async function NovedadesPreview({
  searchParams,
}: {
  searchParams: Promise<{ caso?: string }>;
}) {
  await requireAdmin(); // 404 for everyone else, like the Torre de Control
  const { caso } = await searchParams;
  const now = await getRenderInstant();

  // Real upcoming albums, soonest first — the same rows the feature uses.
  const upcoming = await db
    .select({
      catalogItemId: catalogItems.id,
      title: catalogItems.title,
      byline: catalogItems.byline,
      posterUrl: catalogItems.posterUrl,
      releaseDate: catalogItems.releaseDate,
    })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.mediaType, "album"),
        gt(catalogItems.releaseDate, new Date()),
      ),
    )
    .orderBy(asc(catalogItems.releaseDate))
    .limit(5);

  const first = upcoming[0];
  const own = first?.releaseDate
    ? {
        title: first.title,
        byline: first.byline,
        posterUrl: first.posterUrl,
        releaseDate: first.releaseDate.toISOString(),
      }
    : null;

  const cases = [
    { id: "1", label: "Varios álbumes por salir", note: "6c · plural" },
    { id: "2", label: "Un álbum por salir", note: "6c · singular" },
    { id: "3", label: "Ningún álbum por salir", note: "6b · con + Seguir" },
  ];
  const active = caso ?? "1";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-5 pt-16 text-text">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
        F3.8 · Novedades · preview
      </p>
      <h1 className="mt-2 font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">
        Los tres casos
      </h1>
      <p className="mt-3 text-[13px] leading-[1.5] text-text-2">
        Componente real, portadas y fechas reales. Ojo: Cerrar y Seguir SÍ
        escriben en tu cuenta — cerrar quema tu propio anuncio.
      </p>

      <nav className="mt-6 flex flex-col gap-2">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={`/prototype/novedades?caso=${c.id}`}
            className={`flex items-center justify-between rounded-full px-4 py-3 text-sm ${
              active === c.id
                ? "bg-accent font-semibold text-bg"
                : "bg-surface-2 text-text"
            }`}
          >
            {c.label}
            <span
              className={`font-mono text-[9px] uppercase tracking-[0.1em] ${
                active === c.id ? "text-bg/70" : "text-text-3"
              }`}
            >
              {c.note}
            </span>
          </Link>
        ))}
      </nav>

      {!first && (
        <p className="mt-8 text-sm text-warn">
          No hay ningún álbum sin publicar en el catálogo, así que no hay nada
          que mostrar. Busca una preventa en Descubrir y vuelve.
        </p>
      )}

      {own && active === "1" && (
        <NovedadesModal
          key="c1"
          initialNow={now}
          own={{ ...own, count: Math.max(upcoming.length, 3) }}
        />
      )}
      {own && active === "2" && (
        <NovedadesModal key="c2" initialNow={now} own={{ ...own, count: 1 }} />
      )}
      {first && active === "3" && (
        <NovedadesModal
          key="c3"
          initialNow={now}
          own={null}
          presetSuggestion={{
            catalogItemId: first.catalogItemId,
            title: first.title,
            byline: first.byline,
            posterUrl: first.posterUrl,
            releaseDate: first.releaseDate!.toISOString(),
          }}
        />
      )}
    </main>
  );
}
