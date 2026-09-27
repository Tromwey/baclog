import {
  byManualOrder,
  fanHexes,
  fanOf,
  formatsLine,
  joinNames,
} from "@/modules/backlog/fan";
import { getPublicBacklog } from "@/modules/backlog/public";
import { coverDataUri } from "@/lib/og";
import { OG_SIZE, collectionOg, ogNotFound } from "@/lib/og-cards";

/**
 * The link preview of a shared collection (WhatsApp, iMessage, X…): 1200×630,
 * the collection as its own page shows it — the feed gradient of its fan's
 * palette, the fan of up to three covers, the name in Newsreader, "una
 * colección de @handle", the formats line in mono and the 蔵 kura lockup
 * (drawn by `collectionOg` in lib/og-cards.tsx).
 *
 * GATES — the SAME read as the page (`getPublicBacklog`: owner public + handle
 * + `backlog.is_public`, public-safe field list). A private or nonexistent
 * collection is a bare 404, identical for both: the page itself already 404s
 * both identically, so a 404 here reveals nothing the page doesn't, and a
 * generic "kura" image would only answer 200 for ids that don't exist.
 *
 * CACHE — dynamic render (no ISR: a stale-while-revalidate cache would keep
 * serving the old image after the collection went private), with an explicit
 * 5-minute shared TTL (`s-maxage=300`, no SWR) so a crawler burst on a fresh
 * share doesn't re-render per hit. That is the privacy window of the
 * preview: at most ~5 minutes after "Privada" our edge stops serving it (what
 * a messaging app already copied into a chat is out of our hands). The 404 is
 * `no-store` so a collection made public previews at once.
 */

export const dynamic = "force-dynamic";
export const alt = "Una colección en kura";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; backlogId: string }>;
}) {
  const { username, backlogId } = await params;
  const data = await getPublicBacklog(username, backlogId);
  if (!data) return ogNotFound();

  const ordered = [...data.items].sort(byManualOrder);
  const fan = fanOf(ordered, data.coverCatalogItemId);
  const count = ordered.length;
  // Founder (2026-09-27) dropped the count only from the credits line above
  // 10a/10b's format pills — the public preview's "N TÍTULOS · FORMATOS" is
  // unrelated and stays.
  const formats = formatsLine([
    ...new Set(ordered.map((i) => i.mediaType)),
  ]).replaceAll(", ", " · ");
  const srcs = await Promise.all(fan.map((c) => coverDataUri(c.posterUrl)));

  return collectionOg({
    name: data.backlogName,
    vibe: data.vibe,
    by: joinNames([
      `@${username}`,
      ...data.collaborators.flatMap((c) => (c.username ? [`@${c.username}`] : [])),
    ]),
    kinds: `${count} ${count === 1 ? "TÍTULO" : "TÍTULOS"}${formats ? ` · ${formats}` : ""}`,
    hexes: fanHexes(fan, ordered),
    covers: fan.map((c, i) => ({
      mediaType: c.mediaType,
      paletteHex: c.paletteHex ?? null,
      src: srcs[i] ?? null,
    })),
    empty: count === 0,
  });
}
