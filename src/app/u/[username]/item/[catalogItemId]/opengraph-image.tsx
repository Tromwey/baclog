import { getPublicCatalogItem, getPublicProfile } from "@/modules/backlog/public";
import { coverDataUri } from "@/lib/og";
import { OG_SIZE, ogNotFound, titleOg } from "@/lib/og-cards";

/**
 * The link preview of a public ficha (/u/[username]/item/[id]): the title's
 * own palette as the 168° tint, the 蔵 kura lockup, "Cine · 2001" in mono,
 * the title in Newsreader italic, the byline, and the cover at its native
 * form (póster 2:3, disco 1:1; the palette recipe when the CDN fails).
 * Replaces the bare poster the page's metadata used to point at (file-based
 * metadata wins over `openGraph.images`).
 *
 * GATES — the SAME pair as the page: `getPublicProfile(username)` (the sharer
 * is public with a handle) AND `getPublicCatalogItem(id)`. Either missing →
 * one identical `no-store` 404, so a private sharer's link previews exactly
 * like a nonexistent one. Only catalog fields are drawn — nothing about the
 * sharer's state on the title.
 *
 * CACHE — dynamic, `s-maxage=300` without SWR (the collection route explains
 * the ~5 min privacy window).
 */

export const dynamic = "force-dynamic";
export const alt = "Un título en kura";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; catalogItemId: string }>;
}) {
  const { username, catalogItemId } = await params;
  const [profile, item] = await Promise.all([
    getPublicProfile(username),
    getPublicCatalogItem(catalogItemId),
  ]);
  if (!profile || !item) return ogNotFound();

  const palette = item.paletteHex ?? [];
  return titleOg({
    title: item.title,
    byline: item.byline,
    year: item.year,
    hexes: palette,
    cover: {
      mediaType: item.mediaType,
      paletteHex: palette,
      src: await coverDataUri(item.posterUrl),
    },
  });
}
