"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getPartyAction } from "@/app/actions/party-collection-actions";
import { CHIP_ART } from "@/components/kura/components";
import { DotsIcon, KIcon } from "@/components/kura/icons";
import { feedSurface, feedTail, tintEnds } from "@/components/kura/tint";
import { Toast, useToast } from "@/components/kura/toast";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { Sheet } from "@/components/ui";
import type { PartyDetail, PartySong } from "@/modules/party-collections/types";
import { logged, PARTY_GONE_MESSAGE } from "./party-errors";
import { setPartyFlash } from "./party-flash";
import { handleOf, PartyHero, songsLabel, SongCover, SongRowBody } from "./party-parts";
import { PartySearch } from "./party-search";
import {
  BlockedSheet,
  CapSheet,
  DeleteSheet,
  EditSheet,
  ExportSheet,
  GuestOptionsSheet,
  LeaveSheet,
  LinkSheet,
  OptionsSheet,
  RemoveSheet,
  SHEET_LABEL,
  ShareSheet,
  WelcomeSheet,
  type SheetState,
} from "./party-sheets";
import { usePartyHexes } from "./use-party-tint";

/**
 * /c/{id} — the party as its members see it (fiesta-app-v2 · collab / host /
 * blocked / empty / ios / cap). Everything the viewer may do comes from the
 * server's `PartyDetail` (`viewer.canAdd`, `song.canRemove`,
 * `song.canBlockAuthor`): the UI only draws the rules (contract §6).
 *
 *  - Guest: the slots card ("Pusiste 1 de 3" · "Te quedan 2"), the bottom
 *    bar "Buscar canción" / "Buscar otra canción" / "Cambiar una canción",
 *    the dismissible "kura para iPhone." once the cap is full, the blocked
 *    notice. Tapping one of their own songs opens "Quitar".
 *  - Guest: Opciones in the header → "Salir de la fiesta" (C3; confirmed,
 *    then /backlogs with a toast). A guest the host blocked can still take
 *    their OWN songs out (C4).
 *  - Host: Compartir + Opciones in the header, "…" per song ("Quitar" and
 *    "Quitar y bloquear a @x"), "Invitar a la fiesta" at the bottom — plus a
 *    search chip beside it: the host has no cap (contract §6.1) and the
 *    design gave them no way in to add (desviación, state/frontend.md).
 *
 * Live: the page re-reads the party when the tab comes back into view. A
 * failed re-read is logged; a gone session goes to login, a gone party to
 * /backlogs with "Esa fiesta ya no está disponible.".
 */

const IOS_OFF = (id: string) => `kura:party-ios-off:${id}`;

export function PartyRoom({
  initial,
  viewerHandle,
  welcome,
  openShare,
}: {
  initial: PartyDetail;
  viewerHandle: string | null;
  /** From the join: "new" = "ya estás dentro." · "back" = "ya estás dentro, @user.". */
  welcome: "new" | "back" | null;
  /** Just created: open "invita a la fiesta.". */
  openShare: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [party, setPartyState] = useState(initial);
  const [lastUrl, setLastUrl] = useState<string | null>(initial.invite?.url ?? null);
  const setParty = useCallback((p: PartyDetail) => {
    setPartyState(p);
    if (p.invite?.url) setLastUrl(p.invite.url);
  }, []);
  const [sheet, setSheet] = useState<SheetState | null>(
    welcome ? { k: "welcome", back: welcome === "back" } : openShare && initial.viewer.role === "host" ? { k: "share" } : null,
  );
  const [searching, setSearching] = useState(false);
  const [iosOff, setIosOff] = useState(true);
  const hexes = usePartyHexes(party.songs);

  // One-shot query flags (?w=, ?sheet=) leave the URL once read.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.search) window.history.replaceState(window.history.state, "", url.pathname);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser dismissal, read after hydration
      setIosOff(window.localStorage.getItem(IOS_OFF(initial.id)) === "1");
    } catch {
      setIosOff(false);
    }
  }, [initial.id]);

  const refresh = useCallback(async () => {
    const res = await logged("refresh", party.id, getPartyAction(party.id));
    if (!res) return; // logged; the page keeps what it has
    if ("ok" in res && res.ok) {
      setParty(res.party);
      return;
    }
    if ("error" in res) {
      if (res.error === "signin_required") {
        window.location.assign(res.loginPath);
      } else if (res.error === "not_found") {
        setPartyFlash(PARTY_GONE_MESSAGE);
        router.replace("/backlogs");
      } else {
        console.error("[party] refresh refused", { partyId: party.id, error: res.error });
      }
    }
  }, [party.id, router, setParty]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const v = party.viewer;
  const host = v.role === "host";
  const limit = party.perGuestLimit;
  const n = party.songs.length;
  const mine = party.songs.filter((s) => s.mine);
  const guestCanPut = !host && !v.blocked && limit !== 0;
  const full = !host && v.remaining === 0 && limit !== null && limit > 0;
  const tail = feedTail(hexes);

  const openSearch = () => {
    setSheet(null);
    setSearching(true);
  };
  const tapSong = (s: PartySong) => {
    if (host || s.canRemove) setSheet({ k: "remove", titleId: s.titleId });
  };
  const dismissIos = () => {
    setIosOff(true);
    try {
      window.localStorage.setItem(IOS_OFF(party.id), "1");
    } catch {
      // stays dismissed for this visit
    }
  };

  const removeTarget = sheet?.k === "remove" ? party.songs.find((s) => s.titleId === sheet.titleId) : null;

  return (
    <main
      className="relative mx-auto min-h-dvh w-full max-w-md pb-[170px] text-text"
      style={{ background: feedSurface(hexes), backgroundColor: tail }}
    >
      <ThemeColorSync color={hexes.length ? tintEnds(hexes)[0] : undefined} exact />
      <header className="mt-1 flex h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
        <Link href="/backlogs" aria-label="Volver a tus colecciones" className={CHIP_ART}>
          <KIcon name="back" size={18} />
        </Link>
        {host ? (
          <div className="flex gap-2">
            <button type="button" aria-label="Compartir" onClick={() => setSheet({ k: "share" })} className={CHIP_ART}>
              <KIcon name="share" size={18} />
            </button>
            <button type="button" aria-label="Opciones" onClick={() => setSheet({ k: "opts" })} className={CHIP_ART}>
              <DotsIcon />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Opciones"
            onClick={() => setSheet({ k: "guestOpts" })}
            className={CHIP_ART}
          >
            <DotsIcon />
          </button>
        )}
      </header>

      <PartyHero
        name={party.name}
        songs={party.songs}
        perGuestLimit={limit}
        contributors={party.contributors}
        who={`${host ? "tuya" : `de ${handleOf(party.host)}`} · ${songsLabel(n)}`}
      />

      {guestCanPut && limit !== null && <SlotsCard mine={mine} limit={limit} />}
      {guestCanPut && limit === null && <OpenSlotsCard mine={mine} />}

      {!host && v.blocked && (
        <Notice title="Ya no puedes agregar canciones">
          {party.host ? `@${party.host.handle}` : "Quien organiza"} te quitó de los colaboradores. Puedes seguir
          viendo la colección{mine.length > 0 ? " y quitar las canciones que pusiste" : ""}.
        </Notice>
      )}
      {!host && !v.blocked && limit === 0 && (
        <Notice title="Esta fiesta es para escuchar">
          {party.host ? `@${party.host.handle}` : "Quien organiza"} decidió que nadie más agregue canciones. Puedes
          seguir viendo la colección.
        </Notice>
      )}

      {n > 0 ? (
        <section aria-label="Las canciones">
          <div className="flex items-baseline justify-between px-5 pb-3.5">
            <h2 className="font-brand text-[22px] font-normal">las canciones</h2>
          </div>
          <ul className="flex flex-col gap-0.5 px-2">
            {party.songs.map((s) => {
              const tappable = host || s.canRemove;
              return (
                <li key={s.titleId} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!tappable}
                    onClick={() => tapSong(s)}
                    aria-label={tappable ? `${s.title}: opciones` : undefined}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors enabled:active:bg-white/[0.05] disabled:cursor-default"
                  >
                    <SongRowBody song={s} />
                  </button>
                  {host && (
                    <button
                      type="button"
                      aria-label={`Opciones de ${s.title}`}
                      onClick={() => setSheet({ k: "remove", titleId: s.titleId })}
                      className="mr-1 flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-2 transition-colors active:bg-white/[0.05]"
                    >
                      <DotsIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col items-center gap-2.5 px-8 text-center">
          <span className="font-brand text-[28px] leading-[1.1]">la pista está vacía.</span>
          <span className="max-w-[28ch] font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
            {host
              ? "Nadie ha puesto nada todavía. Comparte el link y que cada quien ponga las suyas."
              : "Nadie ha puesto nada todavía. Alguien tiene que abrir la pista."}
          </span>
        </div>
      )}

      {full && !iosOff && !sheet && (
        <div className="mx-3 mt-7 flex items-center gap-3 rounded-[26px] bg-[var(--glass-bg)] py-4 pl-[18px] pr-2">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="font-brand text-[20px] text-text">kura para iPhone.</span>
            <span className="font-sans text-[14px] leading-[1.4] text-text-2">
              Sigue la colección desde tu teléfono la noche de la fiesta.
            </span>
          </div>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={dismissIos}
            className="flex h-11 w-11 flex-none items-center justify-center self-start rounded-full text-text-2 transition-colors active:bg-white/[0.06]"
          >
            <KIcon name="close" size={14} />
          </button>
        </div>
      )}

      {/* The bottom bar — never for a blocked guest nor a "solo ver" party. */}
      {(host || guestCanPut) && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md gap-2.5 px-4 pb-[calc(30px+env(safe-area-inset-bottom))] pt-14"
          style={{ background: `linear-gradient(transparent, ${tail} 42%)` }}
        >
          {host ? (
            <>
              <button
                type="button"
                aria-label="Buscar canción"
                onClick={openSearch}
                className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[var(--glass-bg)] text-text bl-press"
              >
                <KIcon name="search" size={18} />
              </button>
              <button type="button" onClick={() => setSheet({ k: "share" })} className={BAR_HONEY}>
                Invitar a la fiesta
              </button>
            </>
          ) : full ? (
            <button
              type="button"
              onClick={() => setSheet({ k: "cap" })}
              className="h-14 w-full rounded-full bg-[var(--glass-bg)] font-sans text-[16px] font-semibold text-text bl-press"
            >
              Cambiar una canción
            </button>
          ) : (
            <button type="button" onClick={openSearch} className={BAR_HONEY}>
              <KIcon name="search" size={18} />
              {v.mineCount === 0 ? "Buscar canción" : "Buscar otra canción"}
            </button>
          )}
        </div>
      )}

      {searching && (
        <PartySearch
          party={party}
          onParty={setParty}
          onCap={() => setSheet({ k: "cap" })}
          onClose={() => setSearching(false)}
          onGone={() => {
            setSearching(false);
            void refresh();
          }}
          toast={toast}
          covered={!!sheet}
        />
      )}

      {sheet && (
        <Sheet onClose={() => setSheet(null)} label={SHEET_LABEL[sheet.k]}>
          {sheet.k === "welcome" && (
            <WelcomeSheet party={party} handle={viewerHandle} back={sheet.back} onSearch={openSearch} />
          )}
          {sheet.k === "cap" && (
            <CapSheet
              party={party}
              onParty={setParty}
              onRemoved={openSearch}
              onDone={() => {
                setSheet(null);
                setSearching(false);
              }}
              toast={toast}
            />
          )}
          {sheet.k === "remove" &&
            (removeTarget ? (
              <RemoveSheet
                party={party}
                song={removeTarget}
                onParty={setParty}
                onStale={() => void refresh()}
                toast={toast}
              />
            ) : (
              <p className="py-6 text-center font-sans text-[15px] text-text-2">Esa canción ya no está.</p>
            ))}
          {sheet.k === "share" && (
            <ShareSheet party={party} onLink={() => setSheet({ k: "link" })} onParty={setParty} toast={toast} />
          )}
          {sheet.k === "link" && <LinkSheet party={party} lastUrl={lastUrl} onParty={setParty} toast={toast} />}
          {sheet.k === "opts" && <OptionsSheet party={party} go={(k) => setSheet({ k })} />}
          {sheet.k === "export" && <ExportSheet party={party} toast={toast} />}
          {sheet.k === "edit" && (
            <EditSheet
              party={party}
              onSaved={(p) => setParty({ ...party, ...p })}
              onDelete={() => setSheet({ k: "delete" })}
              toast={toast}
            />
          )}
          {sheet.k === "delete" && (
            <DeleteSheet party={party} onDeleted={() => router.replace("/backlogs")} toast={toast} />
          )}
          {sheet.k === "blocked" && <BlockedSheet party={party} onChanged={() => void refresh()} toast={toast} />}
          {sheet.k === "guestOpts" && <GuestOptionsSheet party={party} onLeave={() => setSheet({ k: "leave" })} />}
          {sheet.k === "leave" && (
            <LeaveSheet
              party={party}
              onLeft={() => {
                setPartyFlash(`Saliste de ${party.name}.`);
                router.replace("/backlogs");
              }}
              toast={toast}
            />
          )}
        </Sheet>
      )}

      <Toast host={toast} bottom={host || guestCanPut ? 112 : 40} />
    </main>
  );
}

const BAR_HONEY =
  "flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full bg-honey px-5 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-3 mb-[22px] flex flex-col gap-1 rounded-[26px] bg-[var(--glass-bg)] px-[18px] py-4">
      <span className="font-sans text-[15px] font-semibold text-text">{title}</span>
      <span className="font-sans text-[14px] leading-[1.45] text-text-2">{children}</span>
    </div>
  );
}

/** "Pusiste 1 de 3" · "Te quedan 2" with one slot per song of the cap. */
function SlotsCard({ mine, limit }: { mine: PartySong[]; limit: number }) {
  const n = mine.length;
  const left = Math.max(0, limit - n);
  const slot = limit > 3 ? 36 : 44;
  const title =
    n === 0
      ? limit === 1
        ? "Tu canción"
        : `Tus ${limit} canciones`
      : n >= limit
        ? limit === 1
          ? "Pusiste tu canción"
          : `Pusiste tus ${limit}`
        : `Pusiste ${n} de ${limit}`;
  const sub =
    n === 0
      ? "Todavía no pones ninguna"
      : n >= limit
        ? limit === 1
          ? "Quítala para cambiarla"
          : "Quita una para cambiarla"
        : `Te ${left === 1 ? "queda" : "quedan"} ${left}`;
  return (
    <div className="mx-3 mb-[22px] flex items-center gap-3.5 rounded-[26px] bg-[var(--glass-bg)] px-4 py-3.5">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: limit }, (_, i) => (
          <SongCover key={i} song={mine[i] ?? null} size={slot} radius={6} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="font-sans text-[15px] font-semibold text-text">{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">{sub}</span>
      </div>
    </div>
  );
}

/** Unlimited party: no slots to fill, just what you put. */
function OpenSlotsCard({ mine }: { mine: PartySong[] }) {
  const n = mine.length;
  return (
    <div className="mx-3 mb-[22px] flex items-center gap-3.5 rounded-[26px] bg-[var(--glass-bg)] px-4 py-3.5">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <SongCover key={i} song={mine[mine.length - 1 - i] ?? null} size={44} radius={6} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="font-sans text-[15px] font-semibold text-text">
          {n === 0 ? "Tus canciones" : `Pusiste ${songsLabel(n)}`}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">Pon las que quieras</span>
      </div>
    </div>
  );
}
