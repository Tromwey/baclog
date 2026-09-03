"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  CrossMediaDiscovery,
  type DiscoveryBacklog,
} from "@/app/(app)/item/[catalogItemId]/cross-media-discovery";
import type { ObsessionRail, LatestDoubleFeature } from "@/modules/recs/discover-rails";
import type { TrendingTitle } from "@/modules/social/trending";
import { AuraField, AUTH_ADN, StrokeIcon, glassChipClass } from "@/components/ui";
import { BACK_PATH } from "@/components/glyph-paths";
import { DiscoverHome } from "./discover-home";
import { SearchSheet } from "./search-sheet";
import { FeatureAura } from "./feature-aura";

type Mode = "home" | "loading" | "ai";

export interface SearchBacklog extends DiscoveryBacklog {
  /** ADN of the backlog — the search sheet glows in the target's colors. */
  paletteHex: string[];
}

/**
 * Discover (Revamp UI, 2026-09-03 — mock 04 + 07). The home is the rails +
 * the Double Feature card; the search field opens the search SHEET (mock 07)
 * over it; the card runs the cross-media engine (cache-first, then at most
 * one generation) and lands on the Double Feature screen — one narrative
 * pairing at a time, the × walks to the next.
 */
export function DescubrirScreen({
  username,
  backlogs,
  totalTitles,
  hasLoved,
  loadingColors,
  rails,
  trending,
  doubleFeature,
}: {
  username: string;
  backlogs: SearchBacklog[];
  totalTitles: number;
  /**
   * The user has at least one "me gusta"/"me obsesiona" — i.e. the reco engine
   * has a seed to work from. False ⇒ the card states its unlock instead of
   * spending the tap on the `no_loved` dead end.
   */
  hasLoved: boolean;
  /** User ADN palette — the loading screen's full-bleed aura + the generic card's glow. */
  loadingColors: string[];
  rails: ObsessionRail[];
  trending: TrendingTitle[];
  doubleFeature: LatestDoubleFeature | null;
}) {
  // ?q= is what survives a trip into an item: the search writes it before
  // pushing /item/…, so the ✕ (router.back) lands back on the SAME list.
  const params = useSearchParams();
  const restoredQuery = params.get("q") ?? "";
  // ?buscar=1&to= — the guided handoff from a backlog: open the sheet directly
  // with that backlog pinned as the add target.
  const guided = params.get("buscar") === "1";
  const pinnedBacklogId = params.get("to");
  const [mode, setMode] = useState<Mode>("home");
  const [searchOpen, setSearchOpen] = useState(
    Boolean(restoredQuery) || guided,
  );
  const [feed, setFeed] = useState<DiscoverFeedResult | null>(null);
  const [aiIndex, setAiIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const openSearch = () => {
    // iOS only raises the keyboard for a focus() that runs inside the tap's own
    // task. Mount the sheet synchronously (flushSync) so the input exists right
    // here, then focus it from the handler — an `autoFocus` or a focus deferred
    // to an effect left the field with a caret and NO keyboard.
    flushSync(() => setSearchOpen(true));
    searchInputRef.current?.focus();
  };

  const closeSearch = () => {
    // Leaving search for real — drop ?q=/?buscar= so the next visit is clean.
    window.history.replaceState(null, "", "/descubrir");
    setSearchOpen(false);
  };

  const recomendar = () => {
    setMode("loading");
    start(async () => {
      // Hold the loading screen (its own aura) for a beat even on a cache hit,
      // so the "distilling your vibe" moment reads instead of flashing by.
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

  // F3.5.9 — stamp the seen ledger for whatever pairing is on screen, so the
  // NEXT visit leads with something they haven't been shown. Fire-and-forget:
  // being seen only deprioritizes (a re-serve is still free), so a lost call
  // costs nothing. Keyed on recId — re-runs when the × advances the card.
  useEffect(() => {
    if (!currentRecId) return;
    void markRecoSeenAction(currentRecId);
  }, [currentRecId]);

  // The × / "otra conexión": DISMISS the current pairing (permanently, per the
  // button's own "Descartar" label), then walk the remaining cached pairings for
  // free, and only spend a generation when they run out.
  const next = () => {
    // .catch: the promise floats on the cheap advance path below, and an expired
    // session must not surface as an unhandled rejection over the card.
    const dismissing = current
      ? dismissRecoAction(current.recId).catch(() => {})
      : Promise.resolve();
    if (aiIndex < readyItems.length - 1) {
      // Advancing uses the list we already hold, so the write can land whenever.
      setAiIndex(aiIndex + 1);
      return;
    }
    start(async () => {
      // AWAIT the × here: the re-read below filters dismissed pairings, so a
      // still-in-flight write would hand the just-dismissed card straight back.
      await dismissing;
      // Pass the seed on screen so "otra conexión" re-rolls THIS title instead
      // of only filling in titles that had no pairing yet.
      const { result, seedCatalogItemId } = await discoverNextRecoAction(
        current?.seed.catalogItemId ?? null,
      );
      // A transient generation failure surfaces its own retryable state instead
      // of silently dropping back. A charge never happened.
      if (result === "failed") {
        setFeed({ kind: "failed" });
        return;
      }
      // We DID spend a discovery (ADR-009 charges the LLM call) but the proposal
      // didn't ground to a real title. Its own state, so the meter drop isn't silent.
      if (result === "spent_no_match") {
        setFeed({ kind: "spent_no_match" });
        return;
      }
      const res = await getDiscoverFeedAction();
      setFeed(res);
      // Land on the pairing we just generated by LOCATING its seed in the
      // re-read feed — never a positional guess (getCrossMediaFeed orders by
      // seed, not append order). Fall back to the last item when nothing new
      // was generated (cap_reached / no_more).
      if (res.kind === "ready") {
        const generatedIndex = seedCatalogItemId
          ? res.items.findIndex(
              (it) => it.seed.catalogItemId === seedCatalogItemId,
            )
          : -1;
        setAiIndex(generatedIndex >= 0 ? generatedIndex : res.items.length - 1);
      }
    });
  };

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip text-text">
      {mode === "home" && (
        <DiscoverHome
          rails={rails}
          trending={trending}
          doubleFeature={doubleFeature}
          hasLoved={hasLoved}
          totalTitles={totalTitles}
          adnHexes={loadingColors}
          pending={pending}
          onSearch={openSearch}
          onRecomendar={recomendar}
        />
      )}

      {mode === "loading" && <Loading colors={loadingColors} />}

      {mode === "ai" && (
        <AiResults
          feed={feed}
          index={aiIndex}
          username={username}
          backlogs={backlogs}
          pending={pending}
          onBack={() => setMode("home")}
          onNext={next}
        />
      )}

      {searchOpen && (
        <SearchSheet
          inputRef={searchInputRef}
          initialQuery={restoredQuery}
          backlogs={backlogs}
          pinnedBacklogId={pinnedBacklogId}
          libraryEmpty={totalTitles === 0}
          onClose={closeSearch}
        />
      )}
    </main>
  );
}

const LOADING_MESSAGES = [
  "Leyendo tu perfil…",
  "Cruzando tus títulos…",
  "Destilando tu vibe…",
];
function Loading({ colors }: { colors: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setI((x) => (x + 1) % LOADING_MESSAGES.length),
      1600,
    );
    return () => clearInterval(t);
  }, []);

  // A richer fixed palette (shared with the auth screens) so the "distilling"
  // moment glows even for sparse profiles — this is the one screen with its own
  // full-bleed background for emphasis.
  const aura = Array.from(new Set([...colors, ...AUTH_ADN]));

  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <AuraField variant="ambient" colors={aura} seed={13} />
      <div className="absolute top-[calc(52px+env(safe-area-inset-top))] font-mono text-[10px] uppercase tracking-[0.16em] text-text-2">
        Baclog · Discover
      </div>
      <div className="relative font-serif text-[26px] italic text-text">
        {LOADING_MESSAGES[i]}
      </div>
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
        title="Los descubrimientos están calentando motores."
        body="Estamos afinando las recomendaciones cross-media. Vuelve en un momento — mientras tanto, sigue amando cosas."
      />
    );
  }
  if (feed.kind === "no_loved") {
    return (
      <EmptyState
        onBack={onBack}
        title="Todavía no amas nada — al menos no en el registro."
        body="Reacciona con 'me gusta' o 'me obsesiona' a algo, y volvemos con una conexión que no veías venir."
      />
    );
  }
  if (feed.kind === "failed") {
    return (
      <EmptyState
        onBack={onBack}
        title="No pudimos generar tu conexión ahora."
        body="Fue un tropiezo del momento, no tú. Reintenta y volvemos a buscar — no gastaste ningún descubrimiento."
        action={<RetryButton onClick={onNext} pending={pending} />}
      />
    );
  }
  if (feed.kind === "spent_no_match") {
    return (
      <EmptyState
        onBack={onBack}
        title="Gastamos un intento, pero no encontramos un match real."
        body="Propusimos una conexión que no existe (todavía) en el catálogo, así que este intento sí contó. Reintenta — a la próxima puede aterrizar."
        action={<RetryButton onClick={onNext} pending={pending} />}
      />
    );
  }
  if (feed.kind === "pending") {
    return (
      <EmptyState
        onBack={onBack}
        title={
          feed.remaining <= 0
            ? "Se te acabaron los descubrimientos del mes."
            : "Estamos afinando tu próxima conexión."
        }
        body={
          feed.remaining <= 0
            ? "Tu gusto no descansa, pero el medidor sí. Volvemos el mes que viene."
            : "Dale al botón para que busquemos la pareja cross-media de algo que amas."
        }
        action={
          feed.remaining > 0 ? (
            <RetryButton
              onClick={onNext}
              pending={pending}
              label="Descúbreme una"
              pendingLabel="Buscando…"
            />
          ) : undefined
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
    <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-dock-clearance pt-[calc(16px+env(safe-area-inset-top))]">
      <FeatureAura
        key={cur.seed.catalogItemId}
        seedPosterUrl={cur.seed.posterUrl}
        recoPosterUrl={cur.reco.posterUrl}
      />
      <div className="relative z-30 flex items-center justify-between">
        <BackChip onClick={onBack} />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-2">
          Tu descubrimiento
        </span>
        <span className="font-mono text-[10px] tracking-[0.1em] text-text-3">
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
          <p className="mt-4 text-center text-sm text-text-2">
            Buscando otra conexión…
          </p>
        )}
      </div>
    </div>
  );
}

function RetryButton({
  onClick,
  pending,
  label = "Reintentar",
  pendingLabel = "Reintentando…",
}: {
  onClick: () => void;
  pending: boolean;
  label?: string;
  pendingLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function EmptyState({
  onBack,
  title,
  body,
  action,
}: {
  onBack: () => void;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative z-10 min-h-dvh">
      <div className="px-4 pt-[calc(48px+env(safe-area-inset-top))]">
        <BackChip onClick={onBack} />
      </div>
      <div className="flex flex-col items-center px-8 pt-[18vh] text-center">
        <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
          Discover
        </p>
        <p className="font-serif text-xl italic text-text">{title}</p>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-2">
          {body}
        </p>
        {action}
      </div>
    </div>
  );
}

/**
 * The AI mode's back control is an in-page mode switch, not a route change,
 * so it can't be the router-backed BackButton — but it IS the same glass
 * chip (glassChipClass + the mock's back glyph), so nothing looks bespoke.
 */
function BackChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Volver"
      className={glassChipClass}
    >
      <StrokeIcon d={BACK_PATH} size={16} strokeWidth={2.4} />
    </button>
  );
}
