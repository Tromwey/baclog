"use client";

import Link from "next/link";
import { CHIP_ART, Glyph } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { DotsIcon, KIcon } from "@/components/kura/icons";
import { feedSurface, feedTail, releaseLabel } from "@/components/kura/tint";
import { ZoomBackButton } from "../zoom-back-button";
import { CollectionBody, nextLabel, type CollectionBodyProps } from "./collection-body";

export type { CollectionItem, OtherCollection } from "./collection-body";

/**
 * Colección (Colecciones · una sola página, 2026-09-27 — design 10b;
 * continues flujos-v2 03–05). The collection continues from its fan: the fan
 * grows into the header.
 *
 * The whole page wears the FEED gradient of the fan's front cover (168°,
 * anchored at 900 px, continuing in its bottom tone). Header: Volver · and
 * Compartir + Opciones at the right, all 44 over art (`--glass-art`); the fan
 * at 225; "colección · fijada" in mono; the name in Newsreader 36.
 *
 * Everything below the name — the line, the credits, the format pills, "el
 * orden", the titles, holding a title (18c) and the Opciones sheet — is
 * `CollectionBody`, the SAME body Tus colecciones (10a) mounts under its
 * carousel. The differences that remain are on purpose: 10a has no Volver
 * and its name lives in the carousel's strip; here the name is the title.
 *
 * `mode="auto"` is the automatic collection "no puedo esperar" (5a): the
 * "auto" pill, "se llena sola…" and the countdown on every cover.
 */

/** Top offsets of the frames (64 from the edge), respecting a taller safe area. */
const CHIP_TOP = "top-[max(64px,calc(20px+env(safe-area-inset-top)))]";
const HEADER_PAD = "pt-[max(126px,calc(82px+env(safe-area-inset-top)))]";

export function CollectionScreen({
  zoom = false,
  ...props
}: CollectionBodyProps & { zoom?: boolean }) {
  const { mode, backlog, now } = props;
  const owned = mode === "owned";
  const content = zoom ? "bl-zoom-content" : "";

  return (
    <CollectionBody {...props} introClassName="pt-2.5">
      {({ present, fan, hexes, empty, addHref, open, body }) => {
        const tail = feedTail(empty ? [] : hexes);
        const nextWait =
          mode === "auto" && present[0]?.releaseDate ? releaseLabel(present[0].releaseDate, now) : null;
        return (
          <div
            className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-14 text-text"
            style={{ background: empty ? undefined : feedSurface(hexes, 900), backgroundColor: tail }}
          >
            <div className={`absolute inset-x-6 ${CHIP_TOP} z-[2] flex items-center justify-between`}>
              <ZoomBackButton className={CHIP_ART} />
              <div className="flex gap-2">
                {owned && (
                  <button
                    type="button"
                    aria-label={`Compartir ${backlog.name}`}
                    onClick={() => open("share")}
                    className={CHIP_ART}
                  >
                    <KIcon name="share" size={18} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Opciones de la colección"
                  onClick={() => open("options")}
                  className={CHIP_ART}
                >
                  <DotsIcon />
                </button>
              </div>
            </div>

            <header
              className={`flex min-w-0 flex-col items-center gap-2.5 px-6 text-center ${HEADER_PAD} ${content} ${
                empty || !owned ? "pb-[26px]" : ""
              }`}
            >
              {empty && owned ? (
                <Link href={addHref} aria-label={`Agregar a ${backlog.name}`} className="block bl-press-lg">
                  <Fan covers={[]} lead={225} ghost />
                </Link>
              ) : (
                <Fan covers={fan} lead={225} ghost={empty} label={`Portadas de ${backlog.name}`} />
              )}

              {mode === "auto" ? (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-glass-art px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-text">
                  <Glyph kind="waiting" size={12} />
                  auto
                </span>
              ) : (
                !empty && (
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
                    {backlog.pinned ? "colección · fijada" : "colección"}
                  </span>
                )
              )}
              <h1
                className={`font-brand font-normal leading-none [overflow-wrap:anywhere] [text-wrap:balance] ${
                  empty ? "mt-1.5 text-[30px]" : "text-[36px]"
                }`}
              >
                {backlog.name}
              </h1>
              {mode === "auto" && (
                <>
                  <span className="font-brand text-[16px] italic leading-[1.3] text-text-2">
                    se llena sola con lo que aún no sale
                  </span>
                  {!empty && (
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
                      {present.length} {present.length === 1 ? "título" : "títulos"}
                      {nextWait && ` · el próximo ${nextLabel(nextWait)}`}
                    </span>
                  )}
                </>
              )}
            </header>

            <div className={content}>{body}</div>
          </div>
        );
      }}
    </CollectionBody>
  );
}
