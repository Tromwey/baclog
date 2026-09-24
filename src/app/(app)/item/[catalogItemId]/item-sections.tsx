"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/kura/components";
import { useItemReaction } from "./reaction-state";

/**
 * "en tus colecciones" (24a / 24c): the collections this title lives in, as
 * glass pills in Newsreader 17, 40 tall, each one a way into its collection.
 * Live off the provider, so "guardar en" and Quitar redraw it at once; with no
 * membership the section isn't there at all.
 */
export function CollectionPills() {
  const { memberIds, backlogs } = useItemReaction();
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
            className="inline-flex h-10 max-w-full items-center truncate rounded-full bg-[var(--glass-bg)] px-4 font-serif text-[17px] text-text bl-press hover:bg-white/[0.12]"
          >
            {b.name}
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
}: {
  phase: "waiting" | "today";
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
    text = inLibrary ? "Pediste que te avisáramos: sale hoy." : "Sale hoy.";
  } else {
    text = inLibrary ? `Te avisamos el ${day}.` : `Sale el ${day}. Guárdala y te avisamos ese día.`;
  }
  return <p className="text-[13px] leading-[1.5] text-text-2">{text}</p>;
}
