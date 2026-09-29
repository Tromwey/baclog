import type { CollectionCard } from "@/modules/social/collection-cards";
import { toTitleSummary } from "./title";

/**
 * Someone else's public collection as Descubrir draws it (Todo's "colecciones
 * para ti", the formats' Kurada row) → wire. Pure; the gates live in the
 * readers (`social/followed-collections.ts`, `social/kurada.ts`). The fan
 * travels as full title summaries so the app reuses its own fan view.
 */
export function toCollectionCardWire(c: CollectionCard) {
  return {
    id: c.id,
    name: c.name,
    owner: c.owner,
    handle: c.username,
    avatarUrl: c.avatarUrl,
    count: c.count,
    format: c.format,
    palette: c.hexes,
    covers: c.fan.map((f) =>
      toTitleSummary({
        catalogItemId: f.catalogItemId,
        title: f.title ?? "",
        mediaType: f.mediaType,
        year: f.year,
        byline: f.byline,
        posterUrl: f.posterUrl,
        paletteHex: f.paletteHex ? [...f.paletteHex] : null,
        releaseDate: f.releaseDate,
      }),
    ),
  };
}
