"use client";

import Link from "next/link";
import { SKELETON_PULSE } from "@/components/kura/components";
import {
  ContributorSeals,
  handleOf,
  perGuestPhrase,
  songsLabel,
  SongRowBody,
  SongRowsSkeleton,
} from "@/components/party/party-parts";
import { partyPath } from "@/modules/party-collections/rules";
import type { PartyCard, PartyDetail } from "@/modules/party-collections/types";

/**
 * A colección de fiesta in the carousel of Tus colecciones (founder,
 * 2026-09-29: "debería mostrarse como las demás colecciones, solo que en
 * formato de lista"). Same place and rhythm as a collection's body — the
 * italic line, the credits, then its content — but the content is the
 * party's SONGS as a list (the rows of /c/{id}: cover 1:1 56, italic title,
 * artist, seal + "Puso @x"/"Pusiste tú").
 *
 * The songs are read on demand for the party in the centre
 * (`getPartyAction`, the same member gate as /c/{id}); `detail` is that read:
 * undefined = loading, "error" = it failed (Reintentar). Every row opens the
 * party (its sheets — Quitar, Quitar y bloquear — live there; there is no
 * per-song deep link to open).
 */
export type PartyBodyState = PartyDetail | "error" | "gone" | undefined;

export function PartyBody({
  party,
  detail,
  onRetry,
}: {
  party: PartyCard;
  detail: PartyBodyState;
  onRetry: () => void;
}) {
  const loaded = typeof detail === "object" ? detail : null;
  const host = party.role === "host";
  const n = loaded ? loaded.songs.length : party.songCount;
  const who = `${host ? "tuya" : `de ${handleOf(loaded?.host ?? party.host)}`} · ${songsLabel(n)}`;
  const href = partyPath(party.id);

  return (
    <>
      <div className="flex min-w-0 flex-col items-center gap-2.5 px-6 pb-[26px] pt-1 text-center">
        <span className="max-w-[32ch] font-brand text-[16px] italic leading-[1.3] text-text-2 [text-wrap:pretty]">
          {perGuestPhrase(loaded?.perGuestLimit ?? party.perGuestLimit)}
        </span>
        <div className="flex items-center gap-2">
          {loaded && <ContributorSeals contributors={loaded.contributors} />}
          <span className="font-sans text-[13px] text-text-2">{who}</span>
        </div>
      </div>

      {detail === undefined && <SongRowsSkeleton pulse={SKELETON_PULSE} aside={0} />}

      {(detail === "error" || detail === "gone") && (
        <div role="status" className="flex flex-col items-center gap-2.5 px-8 pt-2 text-center">
          <h2 className="font-brand text-[22px] font-normal leading-[1.15] text-text-2 [text-wrap:balance]">
            {detail === "gone" ? "esta fiesta ya no está disponible" : "no se cargaron las canciones"}
          </h2>
          <p className="font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
            {detail === "gone"
              ? "Puede que ya no exista o que ya no seas parte de ella."
              : "Revisa tu conexión y vuelve a intentarlo."}
          </p>
          {detail === "error" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex min-h-12 items-center rounded-full bg-[var(--glass-bg)] px-[22px] font-sans text-[16px] font-semibold text-text bl-press"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {loaded && loaded.songs.length > 0 && (
        <ul aria-label={`Canciones de ${party.name}`} className="flex flex-col gap-0.5 px-2">
          {loaded.songs.map((s) => (
            <li key={s.titleId}>
              <Link
                href={href}
                aria-label={`${s.title}: abrir la fiesta`}
                className="flex min-w-0 items-center gap-3 rounded-[18px] px-3 py-2 text-left transition-colors active:bg-white/[0.05]"
              >
                <SongRowBody song={s} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {loaded && loaded.songs.length === 0 && (
        <div className="flex flex-col items-center gap-2.5 px-8 pt-2 text-center">
          <h2 className="font-brand text-[22px] font-normal leading-[1.15] text-text-2 [text-wrap:balance]">
            la pista está vacía
          </h2>
          <p className="max-w-[30ch] font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
            {host
              ? "Nadie ha agregado canciones todavía. Comparte el link y que cada quien agregue las suyas."
              : "Nadie ha agregado canciones todavía. Alguien tiene que abrir la pista."}
          </p>
        </div>
      )}
    </>
  );
}
