import Link from "next/link";
import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { getCrossMediaFeed, type CrossMediaFeed } from "@/modules/recs/crossmedia";
import {
  CrossMediaDiscovery,
  type DiscoveryBacklog,
} from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import { DiscoverMore } from "./discover-more";

/**
 * F3.5.6 — Recommendations as a first-class destination. The Double Feature is
 * the VISUALIZATION of a cross-media reco (Baclog's moat); this page gives it a
 * home. It reuses the shipped engine (getCrossMediaFeed → getCrossMediaReco),
 * the discovery component, and the Double Feature card export — cap, per-seed
 * cache, grounding, and provider selection all stay exactly as shipped.
 *
 * Share-oriented, not an infinite feed: each pairing leads to making/sharing its
 * card, and new pairings come only from the explicit "discover another" tap.
 */
export default async function ParaTiPage() {
  const user = await requireUser();

  // Degrade gracefully if the F3.5.5 tables aren't migrated in this environment
  // (deploy ahead of migration) — show the empty state, never 500.
  let feed: CrossMediaFeed | null = null;
  try {
    feed = await getCrossMediaFeed(user.id);
  } catch (err) {
    console.error("[para-ti] cross-media feed unavailable:", err);
  }

  const backlogs = await getBacklogsForUser(user.id);
  const pickerBase = backlogs.slice(0, 8);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg px-4 pb-24 pt-8 text-text">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          Para ti
        </p>
        <h1 className="mt-2 font-display text-[30px] font-bold leading-tight tracking-[-0.01em] text-text">
          Tus double features
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">
          Conexiones cross-media hechas de lo que amas. Cada una es una tarjeta
          lista para postear — el truco que nadie más tiene.
        </p>
      </header>

      {!feed ? (
        <EmptyUnavailable />
      ) : !feed.hasLovedItems ? (
        <EmptyNoLoved />
      ) : feed.items.length === 0 ? (
        <>
          <EmptyPending remaining={feed.remaining} />
          <DiscoverMore remaining={feed.remaining} cap={feed.cap} />
        </>
      ) : (
        <>
          <div className="mt-8 divide-y divide-line">
            {feed.items.map((it) => (
              <div
                key={it.seed.catalogItemId}
                className="py-10 first:pt-0 last:pb-0"
              >
                <CrossMediaDiscovery
                  variant="page"
                  seed={{
                    catalogItemId: it.seed.catalogItemId,
                    title: it.seed.title,
                    type: it.seed.type,
                    byline: it.seed.byline,
                    year: it.seed.year,
                    posterUrl: it.seed.posterUrl,
                  }}
                  reco={{
                    catalogItemId: it.reco.targetCatalogItemId,
                    title: it.reco.targetTitle,
                    type: it.reco.targetMediaType,
                    byline: it.reco.targetByline,
                    year: it.reco.targetYear,
                    posterUrl: it.reco.targetPosterUrl,
                  }}
                  narrative={it.reco.narrative}
                  username={user.username ?? ""}
                  defaultBacklog={it.defaultBacklog}
                  backlogs={pickerBase.map(
                    (b): DiscoveryBacklog => ({
                      id: b.id,
                      name: b.name,
                      itemCount: b.itemCount,
                      isSeedHome: b.id === it.defaultBacklog.id,
                    }),
                  )}
                />
              </div>
            ))}
          </div>
          <DiscoverMore remaining={feed.remaining} cap={feed.cap} />
        </>
      )}
    </main>
  );
}

/**
 * The reco engine is unavailable (F3.5.5 tables not migrated in this
 * environment). Degrade to a neutral, honest empty state — never a 500, and
 * never the misleading "you love nothing" copy.
 */
function EmptyUnavailable() {
  return (
    <div className="mt-16 text-center">
      <p className="font-serif text-xl italic text-text">
        Los double features están calentando motores.
      </p>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-2">
        Estamos afinando las recomendaciones cross-media. Vuelve en un momento —
        mientras tanto, sigue amando cosas.
      </p>
      <Link
        href="/backlogs"
        className="mt-6 inline-block rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent"
      >
        Ver mis backlogs
      </Link>
    </div>
  );
}

/** No eligible loved items yet — the honest, deadpan empty state (voz §7). */
function EmptyNoLoved() {
  return (
    <div className="mt-16 text-center">
      <p className="font-serif text-xl italic text-text">
        Todavía no amas nada — al menos no en el registro.
      </p>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-2">
        Marca algo como <span className="text-hot">obsessing over</span> o
        califícalo <span className="text-accent">★★★★+</span> al completarlo, y
        volvemos con una conexión que no veías venir.
      </p>
      <Link
        href="/backlogs"
        className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg"
      >
        Ir a mis backlogs
      </Link>
    </div>
  );
}

/**
 * Loved items exist but no pairing surfaced (cap reached with nothing cached, or
 * the last attempt didn't ground). Never a dead end — DiscoverMore lets them
 * retry and shows the meter.
 */
function EmptyPending({ remaining }: { remaining: number }) {
  return (
    <div className="mt-16 text-center">
      <p className="font-serif text-xl italic text-text">
        {remaining <= 0
          ? "Se te acabaron los descubrimientos del mes."
          : "Estamos afinando tu próxima conexión."}
      </p>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-2">
        {remaining <= 0
          ? "Tu gusto no descansa, pero el medidor sí. Volvemos el mes que viene."
          : "Dale al botón para que busquemos la pareja cross-media de algo que amas."}
      </p>
    </div>
  );
}
