import Link from "next/link";
import { requireUser } from "@/auth";
import { getBacklogsForUser } from "@/modules/backlog/queries";
import { getCrossMediaFeed, type CrossMediaFeed } from "@/modules/recs/crossmedia";
import type { DiscoveryBacklog } from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import { DiscoverMore } from "./discover-more";
import { ParaTiScreen, type ScreenItem } from "./para-ti-screen";

/**
 * F3.5.6 — Recommendations as a first-class destination. The cross-media
 * discovery IS this screen (ParaTiScreen), not a card inside a page. It reuses
 * the shipped engine (getCrossMediaFeed → getCrossMediaReco), so cap, per-seed
 * cache, grounding, and provider selection stay exactly as shipped.
 */
export default async function ParaTiPage() {
  const user = await requireUser();

  // Degrade gracefully if the F3.5.5 tables aren't migrated in this environment.
  let feed: CrossMediaFeed | null = null;
  try {
    feed = await getCrossMediaFeed(user.id);
  } catch (err) {
    console.error("[para-ti] cross-media feed unavailable:", err);
  }

  const backlogs = await getBacklogsForUser(user.id);
  const pickerBacklogs: DiscoveryBacklog[] = backlogs.slice(0, 8).map((b) => ({
    id: b.id,
    name: b.name,
    itemCount: b.itemCount,
  }));

  const items: ScreenItem[] =
    feed?.items.map((it) => ({
      seed: {
        catalogItemId: it.seed.catalogItemId,
        title: it.seed.title,
        type: it.seed.type,
        byline: it.seed.byline,
        year: it.seed.year,
        posterUrl: it.seed.posterUrl,
      },
      reco: {
        catalogItemId: it.reco.targetCatalogItemId,
        title: it.reco.targetTitle,
        type: it.reco.targetMediaType,
        byline: it.reco.targetByline,
        year: it.reco.targetYear,
        posterUrl: it.reco.targetPosterUrl,
      },
      narrative: it.reco.narrative,
      defaultBacklog: it.defaultBacklog,
    })) ?? [];

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {!feed ? (
        <EmptyUnavailable />
      ) : !feed.hasLovedItems ? (
        <EmptyNoLoved />
      ) : items.length === 0 ? (
        <EmptyPending remaining={feed.remaining} cap={feed.cap} />
      ) : (
        <ParaTiScreen
          items={items}
          username={user.username ?? ""}
          backlogs={pickerBacklogs}
          remaining={feed.remaining}
          cap={feed.cap}
        />
      )}
    </main>
  );
}

/** Shared shell for the empty/degraded states — centered, with brand context. */
function EmptyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
        Para ti
      </p>
      {children}
    </div>
  );
}

/** The reco engine is unavailable (F3.5.5 tables not migrated). Never a 500. */
function EmptyUnavailable() {
  return (
    <EmptyShell>
      <p className="font-serif text-xl italic text-text">
        Los descubrimientos están calentando motores.
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
    </EmptyShell>
  );
}

/** No eligible loved items yet — the honest, deadpan empty state (voz §7). */
function EmptyNoLoved() {
  return (
    <EmptyShell>
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
    </EmptyShell>
  );
}

/** Loved items exist but nothing surfaced (cap reached / last attempt failed). */
function EmptyPending({ remaining, cap }: { remaining: number; cap: number }) {
  return (
    <EmptyShell>
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
      <div className="mt-6">
        <DiscoverMore remaining={remaining} cap={cap} />
      </div>
    </EmptyShell>
  );
}
