"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ShareChip } from "@/app/u/share-chip";
import type { FanCover } from "@/modules/backlog/fan";
import { Fan } from "./fan";

/**
 * The collections on a profile (Colecciones formalizado · 3a/3b — 6d of the
 * exploration): the PINNED collection (or the first) big and floating — its
 * fan at 186 standing on its floor shadow, "fijada · 12 títulos", the name in
 * Newsreader 28, the line in italic and, on someone else's profile, a glass
 * Compartir — then four more in two columns of fans at 99 with the name at
 * 20 and the count, and "Ver las N" at the section's right.
 *
 * No boxes: the page's feed gradient is the only surface. On your own
 * profile "Ver las N" goes to Tus colecciones (`seeAllHref`); on someone
 * else's it unfolds the rest right here.
 */

export interface ShowcaseCollection {
  id: string;
  name: string;
  vibe: string | null;
  count: number;
  pinned: boolean;
  fan: FanCover[];
  href: string;
}

const GRID = 4;

export function CollectionsShowcase({
  title,
  collections,
  seeAllHref,
  sharePrefix,
  empty,
}: {
  title: string;
  collections: ShowcaseCollection[];
  /** Own profile: "Ver las N" links here instead of unfolding. */
  seeAllHref?: string;
  /** Visitor only: the featured one gets a glass Compartir of its public
   *  page, `${sharePrefix}/${id}` ("/u/mariel"). */
  sharePrefix?: string;
  /** What an empty section shows (own profile); omitted = no section. */
  empty?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (collections.length === 0 && !empty) return null;

  const featured = collections.find((c) => c.pinned) ?? collections[0];
  const rest = collections.filter((c) => c !== featured);
  const shown = open ? rest : rest.slice(0, GRID);
  const n = collections.length;
  const more = rest.length > GRID;
  const seeAll = n === 1 ? "Ver la colección" : `Ver las ${n}`;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3 px-5">
        <h2 className="font-brand text-[24px] font-normal leading-[1.1] text-text">{title}</h2>
        {n > 0 &&
          (seeAllHref ? (
            <Link
              href={seeAllHref}
              className="text-[14px] font-medium text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
            >
              {seeAll}
            </Link>
          ) : (
            more && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="text-[14px] font-medium text-text-2 transition-[color,opacity] hover:text-text active:opacity-60"
              >
                {open ? "Ver menos" : seeAll}
              </button>
            )
          ))}
      </div>

      {!featured ? (
        empty
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 px-5 pb-2.5 pt-1.5 text-center">
            <Link href={featured.href} aria-label={`Abrir ${featured.name}`} className="block bl-press-lg">
              <Fan covers={featured.fan} lead={186} ghost={featured.fan.length === 0} />
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
              {featured.pinned ? "fijada · " : ""}
              {featured.count} {featured.count === 1 ? "título" : "títulos"}
            </span>
            <Link
              href={featured.href}
              className="font-brand text-[28px] leading-none text-text [overflow-wrap:anywhere] [text-wrap:balance]"
            >
              {featured.name}
            </Link>
            {featured.vibe && (
              <span className="max-w-[32ch] font-brand text-[15px] italic text-text-2 [text-wrap:pretty]">
                {featured.vibe}
              </span>
            )}
            {sharePrefix && (
              <ShareChip
                path={`${sharePrefix}/${featured.id}`}
                label={`Compartir ${featured.name}`}
                text="Compartir"
                className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--glass-bg)] pl-[13px] pr-4 font-sans text-[14px] font-semibold text-text bl-press hover:bg-white/[0.12]"
              />
            )}
          </div>

          {shown.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-[30px] px-4 pt-3.5">
              {shown.map((c) => (
                <Link
                  key={c.id}
                  href={c.href}
                  className="flex flex-col items-center gap-2 text-center bl-press-lg"
                >
                  <Fan covers={c.fan} lead={99} ghost={c.fan.length === 0} />
                  <span className="flex flex-col items-center gap-[5px]">
                    <span className="font-brand text-[20px] leading-[1.05] text-text [overflow-wrap:anywhere] [text-wrap:balance]">
                      {c.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-2">
                      {c.count} {c.count === 1 ? "título" : "títulos"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
