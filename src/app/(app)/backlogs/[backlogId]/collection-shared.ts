import type { KIconName } from "@/components/kura/icons";
import type { CollectionItem } from "@/modules/backlog/collection-item";
import type { MediaType } from "@/modules/catalog/types";

/**
 * What the collection's body and its sheets both read (collection-body.tsx ·
 * collection-sheets.tsx): the sort modes, the format vocabulary and a title's
 * reaction glyph. Plain module — no "use client", no JSX.
 */

export type Sort = "manual" | "recent" | "title" | "state" | "year";
export const SORTS: { id: Sort; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "recent", label: "Recientes" },
  { id: "title", label: "Título" },
  { id: "state", label: "Estado" },
  { id: "year", label: "Año" },
];
export const FORMAT: Record<MediaType, { icon: KIconName; singular: string; plural: string; one: string }> = {
  film: { icon: "film", singular: "película", plural: "películas", one: "Cine" },
  series: { icon: "series", singular: "serie", plural: "series", one: "Serie" },
  album: { icon: "music", singular: "álbum", plural: "álbumes", one: "Álbum" },
};


export const REACTION: Record<"obsessed" | "liked" | "completed", string> = {
  obsessed: "Me obsesiona",
  liked: "Me gusta",
  completed: "Completo",
};

export function glyphOf(it: CollectionItem): "obsessed" | "liked" | "completed" | null {
  if (it.obsessed) return "obsessed";
  if (it.verdict === "liked") return "liked";
  if (it.status === "completed") return "completed";
  return null;
}
