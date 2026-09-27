import { collectionOg, ogNotFound, profileOg, titleOg } from "@/lib/og-cards";
import { DEMO_BACKLOG } from "../../data";

/**
 * The link previews with the lab's sample data, through the same renderers
 * the `opengraph-image` routes use (lib/og-cards.tsx) — no database, no
 * session. Development only: layouts don't wrap route handlers, so this one
 * 404s in production itself. `/prototype/og/{coleccion|perfil|titulo|album}`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (process.env.NODE_ENV === "production") return ogNotFound();
  const items = DEMO_BACKLOG.items;
  const covers = items.slice(0, 3).map((i) => ({ mediaType: i.type, paletteHex: i.palette ?? null, src: null }));
  const lead = items[0].palette ?? [];
  switch ((await params).kind) {
    case "coleccion":
      return collectionOg({
        name: DEMO_BACKLOG.name,
        vibe: DEMO_BACKLOG.vibe ?? null,
        by: "@sofi",
        kinds: "5 TÍTULOS · CINE · ÁLBUMES · SERIES",
        hexes: lead,
        covers,
        empty: false,
      });
    case "perfil":
      return profileOg({
        displayName: "Sofía Rivera",
        username: "sofi",
        meta: "3 COLECCIONES · 128 SEGUIDORES",
        hexes: lead,
        covers,
      });
    case "titulo":
    case "album": {
      const i = items[(await params).kind === "album" ? 1 : 0];
      return titleOg({
        title: i.title,
        byline: i.byline,
        year: i.year,
        hexes: i.palette ?? [],
        cover: { mediaType: i.type, paletteHex: i.palette ?? null, src: null },
      });
    }
    default:
      return ogNotFound();
  }
}
