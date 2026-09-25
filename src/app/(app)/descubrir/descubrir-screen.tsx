"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  discoverNextRecoAction,
  dismissRecoAction,
  getDiscoverFeedAction,
  markRecoSeenAction,
  type DiscoverFeedResult,
} from "@/app/actions/crossmedia-actions";
import {
  addItemAction,
  removeMembershipAction,
} from "@/app/actions/backlog-item-actions";
import { createBacklogAction } from "@/app/actions/backlog-actions";
import {
  CrossMediaDiscovery,
  type DiscoveryBacklog,
} from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import { extractPalette } from "@/modules/cards/palette";
import type { LatestDoubleFeature } from "@/modules/recs/discover-rails";
import type { TrendingTitle } from "@/modules/social/trending";
import type { UpcomingItem } from "@/components/upcoming-shelf";
import {
  CHIP_44,
  GLASS_BUTTON,
  SOLID_BUTTON,
} from "@/components/kura/components";
import { BACK_PATH } from "@/components/glyph-paths";
import { Toast, useToast } from "@/components/kura/toast";
import { DiscoverHome, type RecCard } from "./discover-home";
import { SearchView } from "./search-view";
import { SearchSheet } from "./search-sheet";
import { SaveSheet, type SaveWork } from "./save-sheet";
import { DoubleFeatureTint } from "./double-feature-tint";
import { FirstItemSheet, type FirstItemCelebration } from "./first-item-sheet";
import { pushSeen, type SeenWork } from "./recents";
import { withMemberships, type LibraryIndex, type Membership } from "./library";
import { TriangleGlyph } from "./kura-bits";

type Mode = "home" | "search" | "loading" | "ai";

export interface SearchBacklog extends DiscoveryBacklog {
  /** The collection's palette — what its thumbnail falls back to without a cover. */
  paletteHex: string[];
}

/**
 * Descubrir (Kura · flujos-v2 19a–19h). Four modes on one route:
 *
 *  - `home`   — 19a (discover-home.tsx);
 *  - `search` — the full-screen search, 19d–19g (search-view.tsx);
 *  - `loading` / `ai` — the Double Feature: the cross-media engine (cache
 *    first, at most one generation) and its one-pairing-at-a-time screen.
 *
 * Every "guardar" in the area opens ONE sheet, 19h (save-sheet.tsx), and this
 * component owns the write, the library index it patches, the "Deshacer"
 * pill and the one-time "primer título guardado" moment. `?buscar=1&to=` (the
 * guided hand-off from a collection) still opens the add sheet (search-sheet)
 * pinned to that collection.
 */
export function DescubrirScreen({
  username,
  backlogs,
  library: initialLibrary,
  totalTitles,
  hasLoved,
  recs,
  trending,
  upcoming,
  now,
  doubleFeature,
}: {
  username: string;
  backlogs: SearchBacklog[];
  library: LibraryIndex;
  totalTitles: number;
  /**
   * At least one "me gusta"/"me obsesiona" — the reco engine has a seed. False
   * ⇒ the Double Feature card states its unlock instead of spending the tap.
   */
  hasLoved: boolean;
  recs: RecCard[];
  trending: TrendingTitle[];
  upcoming: UpcomingItem[];
  now: number;
  doubleFeature: LatestDoubleFeature | null;
}) {
  // ?q= is what survives a trip into an item: the search writes it before
  // pushing /item/…, so the item's back lands on the SAME results.
  const params = useSearchParams();
  const restored = (params.get("q") ?? "").trim();
  const restoredQuery = restored.length >= 2 ? restored : "";
  const guided = params.get("buscar") === "1";
  const pinnedBacklogId = params.get("to");

  const [mode, setMode] = useState<Mode>(restoredQuery ? "search" : "home");
  const [addOpen, setAddOpen] = useState(guided);
  const [feed, setFeed] = useState<DiscoverFeedResult | null>(null);
  const [aiIndex, setAiIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  // Pinned for the visit (learnings/2026-09-02-revalidatepath…): the client
  // copy is the truth after the first save, the server prop never overrides it.
  const [library, setLibrary] = useState<LibraryIndex>(initialLibrary);
  const [collections, setCollections] = useState<SearchBacklog[]>(backlogs);
  const [saving, setSaving] = useState<SaveWork | null>(null);
  const toastHost = useToast();
  const { show: showToast } = toastHost;
  const [celebration, setCelebration] = useState<FirstItemCelebration | null>(null);
  const queuedCelebration = useRef<FirstItemCelebration | null>(null);
  const libraryWasEmpty = useRef(totalTitles === 0);

  const openSearch = () => {
    // iOS only raises the keyboard for a focus() inside the tap's own task:
    // mount the search synchronously, then focus from the handler.
    flushSync(() => setMode("search"));
    searchInputRef.current?.focus();
  };

  const closeSearch = () => {
    window.history.replaceState(null, "", "/descubrir");
    setMode("home");
  };

  const closeAdd = () => {
    window.history.replaceState(null, "", "/descubrir");
    setAddOpen(false);
  };

  const seen = (w: SeenWork) => pushSeen(w);

  // §patrones · confirmar y deshacer, on the shared pill. The undo is a
  // REVERSE write (the save already landed), so it runs as an async action:
  // the pill waits for it, and a "no se pudo deshacer" it raises replaces it.
  const say = useCallback(
    (text: string, undo?: () => Promise<void>) =>
      showToast(
        undo
          ? { message: text, kind: "undo", actionLabel: "Deshacer", onAction: undo }
          : { message: text },
      ),
    [showToast],
  );
  const fail = useCallback(
    (text: string) => showToast({ message: text, kind: "error" }),
    [showToast],
  );

  const nameOf = (id: string) =>
    collections.find((c) => c.id === id)?.name ?? "tu colección";

  /**
   * Put `work` in exactly `backlogIds`. Adds run BEFORE removals: moving a
   * title between collections must never pass through "in none", which GC's
   * its per-title state (removeMembershipAction). Returns false when a write
   * failed — the index keeps whatever did land.
   */
  const saveTo = async (work: SaveWork, backlogIds: string[]): Promise<boolean> => {
    const id = work.catalogItemId;
    const before = library.byTitle[id] ?? [];
    const toAdd = backlogIds.filter((b) => !before.some((m) => m.backlogId === b));
    const toRemove = before.filter((m) => !backlogIds.includes(m.backlogId));
    let current: Membership[] = [...before];
    const added: Membership[] = [];
    let ok = true;

    try {
      // Palette is cover-derived and cached on catalog_item: extract on-device
      // only when this title has none yet.
      let paletteHex: string[] | undefined;
      if (toAdd.length > 0 && !(work.paletteHex?.length) && work.posterUrl) {
        const p = await extractPalette(work.posterUrl);
        if (p.length > 0) paletteHex = p;
      }
      for (const b of toAdd) {
        const res = await addItemAction({ backlogId: b, catalogItemId: id, paletteHex });
        const newId = "id" in res ? res.id : undefined;
        if (!newId) throw new Error("add failed");
        const m: Membership = { backlogId: b, backlogItemId: newId };
        added.push(m);
        current = [...current, m];
      }
      for (const m of toRemove) {
        await removeMembershipAction(m.backlogItemId);
        current = current.filter((x) => x.backlogItemId !== m.backlogItemId);
      }
    } catch {
      ok = false;
    }

    const landed = current;
    setLibrary((lib) => {
      const next = withMemberships(lib, id, landed);
      if (added.length === 0) return next;
      const thumbs = { ...next.thumbs };
      for (const m of added) {
        thumbs[m.backlogId] = {
          posterUrl: work.posterUrl,
          paletteHex: work.paletteHex ?? [],
          mediaType: work.mediaType,
        };
      }
      return { ...next, thumbs, lastUsedBacklogId: added[added.length - 1].backlogId };
    });
    if (!ok) return false;

    const removed = toRemove;
    const text =
      added.length > 0 && removed.length === 0
        ? added.length === 1
          ? `Guardado en ${nameOf(added[0].backlogId)}`
          : `Guardado en ${added.length} colecciones`
        : removed.length > 0 && added.length === 0
          ? removed.length === 1
            ? `Quitado de ${nameOf(removed[0].backlogId)}`
            : `Quitado de ${removed.length} colecciones`
          : "Colecciones actualizadas";

    say(text, async () => {
      // Reverse, in the same safe order: put back what left, then take out
      // what arrived.
      let cur = landed;
      try {
        for (const m of removed) {
          const res = await addItemAction({ backlogId: m.backlogId, catalogItemId: id });
          const newId = "id" in res ? res.id : undefined;
          if (!newId) throw new Error("undo failed");
          cur = [...cur, { backlogId: m.backlogId, backlogItemId: newId }];
        }
        for (const m of added) {
          await removeMembershipAction(m.backlogItemId);
          cur = cur.filter((x) => x.backlogItemId !== m.backlogItemId);
        }
      } catch {
        fail("No se pudo deshacer. Revisa tu conexión.");
      }
      const final = cur;
      setLibrary((lib) => withMemberships(lib, id, final));
    });

    // The first title of the account → the closing moment, once, AFTER the
    // save sheet has left (never two sheets at a time).
    if (libraryWasEmpty.current && added.length > 0) {
      libraryWasEmpty.current = false;
      queuedCelebration.current = {
        title: work.title,
        mediaType: work.mediaType,
        year: work.year,
        posterUrl: work.posterUrl,
        paletteHex: work.paletteHex ?? [],
        backlogId: added[0].backlogId,
        backlogName: nameOf(added[0].backlogId),
      };
    }
    return true;
  };

  const createCollection = async (name: string): Promise<SearchBacklog | null> => {
    try {
      const res = await createBacklogAction({ name });
      const newId = "id" in res ? res.id : undefined;
      if (!newId) return null;
      const fresh: SearchBacklog = { id: newId, name, itemCount: 0, paletteHex: [] };
      setCollections((c) => [fresh, ...c]);
      return fresh;
    } catch {
      return null;
    }
  };

  const closeSave = () => {
    setSaving(null);
    if (queuedCelebration.current) {
      setCelebration(queuedCelebration.current);
      queuedCelebration.current = null;
    }
  };

  const recomendar = () => {
    setMode("loading");
    start(async () => {
      // Hold the loading screen a beat even on a cache hit, so the moment
      // reads instead of flashing by.
      const [res] = await Promise.all([
        getDiscoverFeedAction(),
        new Promise((r) => setTimeout(r, 1100)),
      ]);
      setFeed(res);
      setAiIndex(0);
      setMode("ai");
    });
  };

  const readyItems = feed && feed.kind === "ready" ? feed.items : [];
  const current = readyItems[Math.min(aiIndex, readyItems.length - 1)] ?? null;
  const currentRecId = current?.recId ?? null;

  // F3.5.9 — stamp the seen ledger for the pairing on screen, so the NEXT
  // visit leads with something new. Fire-and-forget.
  useEffect(() => {
    if (!currentRecId) return;
    void markRecoSeenAction(currentRecId);
  }, [currentRecId]);

  // The × / "otra conexión": DISMISS the current pairing, walk the remaining
  // cached ones for free, and only spend a generation when they run out.
  const next = () => {
    const dismissing = current
      ? dismissRecoAction(current.recId).catch(() => {})
      : Promise.resolve();
    if (aiIndex < readyItems.length - 1) {
      setAiIndex(aiIndex + 1);
      return;
    }
    start(async () => {
      // AWAIT the × here: the re-read below filters dismissed pairings.
      await dismissing;
      const { result, seedCatalogItemId } = await discoverNextRecoAction(
        current?.seed.catalogItemId ?? null,
      );
      if (result === "failed") {
        setFeed({ kind: "failed" });
        return;
      }
      if (result === "spent_no_match") {
        setFeed({ kind: "spent_no_match" });
        return;
      }
      const res = await getDiscoverFeedAction();
      setFeed(res);
      // Land on the pairing just generated by LOCATING its seed — never a
      // positional guess (the feed orders by seed, not append order).
      if (res.kind === "ready") {
        const generatedIndex = seedCatalogItemId
          ? res.items.findIndex((it) => it.seed.catalogItemId === seedCatalogItemId)
          : -1;
        setAiIndex(generatedIndex >= 0 ? generatedIndex : res.items.length - 1);
      }
    });
  };

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip text-text">
      {mode === "home" && (
        <DiscoverHome
          recs={recs}
          trending={trending}
          upcoming={upcoming}
          now={now}
          doubleFeature={doubleFeature}
          hasLoved={hasLoved}
          totalTitles={totalTitles}
          library={library}
          pending={pending}
          onSearch={openSearch}
          onSave={setSaving}
          onOpen={seen}
          onRecomendar={recomendar}
        />
      )}

      {mode === "search" && (
        <SearchView
          inputRef={searchInputRef}
          initialQuery={restoredQuery}
          library={library}
          onCancel={closeSearch}
          onSave={setSaving}
        />
      )}

      {mode === "loading" && <Loading />}

      {mode === "ai" && (
        <AiResults
          feed={feed}
          index={aiIndex}
          username={username}
          backlogs={collections}
          pending={pending}
          onBack={() => setMode("home")}
          onNext={next}
        />
      )}

      {addOpen && (
        <SearchSheet
          inputRef={searchInputRef}
          initialQuery=""
          backlogs={collections}
          pinnedBacklogId={pinnedBacklogId}
          libraryEmpty={totalTitles === 0}
          library={library}
          onMembershipChange={(catalogItemId, backlogId, backlogItemId) =>
            setLibrary((lib) => {
              const rest = (lib.byTitle[catalogItemId] ?? []).filter(
                (m) => m.backlogId !== backlogId,
              );
              return withMemberships(
                lib,
                catalogItemId,
                backlogItemId ? [...rest, { backlogId, backlogItemId }] : rest,
              );
            })
          }
          onClose={closeAdd}
        />
      )}

      {saving && (
        <SaveSheet
          key={saving.catalogItemId}
          work={saving}
          collections={collections}
          library={library}
          onSave={saveTo}
          onCreate={createCollection}
          onClose={closeSave}
        />
      )}

      {celebration && (
        <FirstItemSheet item={celebration} onDismiss={() => setCelebration(null)} />
      )}

      {/* Over the dock: the pill sits just above it. */}
      <Toast host={toastHost} bottom="calc(var(--dock-clearance) - 22px)" />
    </main>
  );
}

const LOADING_MESSAGES = [
  "leyendo lo que te obsesiona…",
  "cruzando cine, series y música…",
  "buscando la pareja…",
];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LOADING_MESSAGES.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <span className="absolute top-[max(64px,calc(20px+env(safe-area-inset-top)))] font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
        Double feature
      </span>
      <p role="status" className="font-display text-[28px] leading-[1.15] text-text text-balance">
        {LOADING_MESSAGES[i]}
      </p>
    </div>
  );
}

function AiResults({
  feed,
  index,
  username,
  backlogs,
  pending,
  onBack,
  onNext,
}: {
  feed: DiscoverFeedResult | null;
  index: number;
  username: string;
  backlogs: DiscoveryBacklog[];
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  if (!feed || feed.kind === "unavailable") {
    return (
      <EmptyState
        onBack={onBack}
        title="las conexiones no están listas."
        body="El motor de recomendaciones no respondió. Vuelve en un rato."
      />
    );
  }
  if (feed.kind === "no_loved") {
    return (
      <EmptyState
        onBack={onBack}
        title="todavía no hay nada que te guste."
        body="Marca un título con «me gusta» o «me obsesiona» y volvemos con una conexión."
      />
    );
  }
  if (feed.kind === "failed") {
    return (
      <EmptyState
        onBack={onBack}
        failure
        title="no pudimos generar tu conexión."
        body="Falló el motor en este intento. No se gastó ningún descubrimiento: vuelve a intentarlo."
        action={<RetryButton onClick={onNext} pending={pending} />}
      />
    );
  }
  if (feed.kind === "spent_no_match") {
    return (
      <EmptyState
        onBack={onBack}
        failure
        title="la conexión no existe en el catálogo."
        body="Propusimos una obra que no encontramos, y ese intento sí contó. Vuelve a intentarlo."
        action={<RetryButton onClick={onNext} pending={pending} />}
      />
    );
  }
  if (feed.kind === "pending") {
    const out = feed.remaining <= 0;
    return (
      <EmptyState
        onBack={onBack}
        title={out ? "se acabaron los descubrimientos del mes." : "todavía no hay una conexión para ti."}
        body={
          out
            ? "Vuelven el mes que viene."
            : "Buscamos la pareja de algo que te gusta: una película para un disco, un disco para una serie."
        }
        action={
          out ? undefined : (
            <button type="button" onClick={onNext} disabled={pending} className={`${SOLID_BUTTON} mt-2`}>
              {pending ? "Buscando…" : "Descúbreme una"}
            </button>
          )
        }
      />
    );
  }

  // The Double Feature IS this screen — one narrative pairing at a time.
  const cur = feed.items[Math.min(index, feed.items.length - 1)];
  const perSeedBacklogs = backlogs.map((b) => ({
    ...b,
    isSeedHome: b.id === cur.defaultBacklog.id,
  }));

  return (
    <div className="relative flex min-h-dvh flex-col px-4 pb-dock-clearance pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
      <DoubleFeatureTint
        key={cur.seed.catalogItemId}
        seedPosterUrl={cur.seed.posterUrl}
        recoPosterUrl={cur.reco.posterUrl}
      />
      <div className="relative z-30 flex items-center justify-between px-2">
        <BackButton onClick={onBack} />
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          Double feature
        </span>
        <span className="w-11 text-right font-mono text-[12px] text-text-2">
          {feed.remaining}/{feed.cap}
        </span>
      </div>
      <div className="relative z-10 flex-1 pt-2">
        <CrossMediaDiscovery
          key={cur.seed.catalogItemId}
          variant="page"
          seed={cur.seed}
          reco={cur.reco}
          narrative={cur.narrative}
          linkKind={cur.linkKind}
          username={username}
          defaultBacklog={cur.defaultBacklog}
          backlogs={perSeedBacklogs}
          onDismiss={onNext}
        />
        {pending && (
          <p role="status" className="mt-4 text-center text-[15px] text-text-2">
            Buscando otra conexión…
          </p>
        )}
      </div>
    </div>
  );
}

function RetryButton({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={pending} className={`${GLASS_BUTTON} mt-2 disabled:opacity-50`}>
      {pending ? "Reintentando…" : "Reintentar"}
    </button>
  );
}

/** §estados · vacío/error: the Newsreader sentence, one line of what to do. */
function EmptyState({
  onBack,
  title,
  body,
  action,
  failure = false,
}: {
  onBack: () => void;
  title: string;
  body: string;
  action?: React.ReactNode;
  failure?: boolean;
}) {
  return (
    <div className="min-h-dvh px-6 pt-[max(64px,calc(20px+env(safe-area-inset-top)))]">
      <BackButton onClick={onBack} />
      <div className="flex flex-col items-start gap-4 px-1 pt-[16vh]">
        {failure && (
          <span className="text-text-2">
            <TriangleGlyph size={22} />
          </span>
        )}
        <h2 className="font-display text-[32px] font-normal leading-[1.1] text-text text-balance">
          {title}
        </h2>
        <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">{body}</p>
        {action}
      </div>
    </div>
  );
}

/**
 * Volver (§componentes: 44, glass). A mode switch inside the page, not a
 * route, so it's a button — the Kura `BackChip` is a link.
 */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Volver" className={CHIP_44}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={BACK_PATH} />
      </svg>
    </button>
  );
}
