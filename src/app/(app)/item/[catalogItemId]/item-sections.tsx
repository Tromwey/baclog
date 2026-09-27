"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/kura/components";
import { Fan } from "@/components/kura/fan";
import { useItemReaction } from "./reaction-state";

/**
 * "en tus colecciones" (24a / 24c): the collections this title lives in, as
 * glass pills in Newsreader 17, 40 tall, each one a way into its collection
 * and led by its mini fan at 22 (Colecciones formalizado · 8).
 * Live off the provider, so "guardar en" and Quitar redraw it at once; with no
 * membership the section isn't there at all.
 */
export function CollectionPills() {
  const { memberIds, backlogs, collections } = useItemReaction();
  const names = backlogs.filter((b) => memberIds.includes(b.id));
  if (names.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>en tus colecciones</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {names.map((b) => (
          <Link
            key={b.id}
            href={`/backlogs/${b.id}`}
            className="inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-[var(--glass-bg)] pl-2 pr-4 font-serif text-[17px] text-text bl-press hover:bg-white/[0.12]"
          >
            <Fan covers={collections.fans[b.id]?.covers ?? []} lead={22} />
            <span className="min-w-0 truncate">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * The note under "dónde ver" / "dónde escuchar" around a release. Depends on
 * whether the title is saved (= "pediste que te avisáramos"), which changes
 * live, so it reads the provider.
 */
export function ReleaseNote({
  phase,
  day,
  pendingTracks,
  arrives,
  album = false,
}: {
  phase: "waiting" | "today";
  /** The pronoun of the note: an album is "lo", a film or series "la". */
  album?: boolean;
  /** "16 oct" — the storefront day. */
  day: string;
  /** Album before release: how many songs are still to come (0 = none). */
  pendingTracks?: number;
  /** "en 14 h" / "el 16 oct" — when those songs arrive. */
  arrives?: string;
}) {
  const { inLibrary } = useItemReaction();
  let text: string;
  if (pendingTracks && pendingTracks > 0 && arrives) {
    text = `Abre el álbum completo. ${
      pendingTracks === 1 ? "La canción que falta llega" : `Las ${pendingTracks} canciones que faltan llegan`
    } ${arrives}.`;
  } else if (phase === "today") {
    text = inLibrary ? "Sale hoy. Estaba en tu no puedo esperar." : "Sale hoy.";
  } else {
    // Saving an unreleased title puts it in "no puedo esperar" (derived:
    // saved + releaseDate ahead); the note names it, and keeps the literal
    // "te avisamos" for the consequence (founder: the ficha keeps Avísame).
    text = inLibrary
      ? `Está en tu no puedo esperar. Te avisamos el ${day}.`
      : `Sale el ${day}. ${album ? "Guárdalo" : "Guárdala"} y te avisamos ese día.`;
  }
  return <p className="text-[13px] leading-[1.5] text-text-2">{text}</p>;
}
