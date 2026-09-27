import { getPublicProfile } from "@/modules/backlog/public";
import { coverDataUri } from "@/lib/og";
import { OG_SIZE, ogNotFound, profileOg } from "@/lib/og-cards";

/**
 * The link preview of a public profile (/u/[username]): the owner's palette
 * as the 168° tint (the same `profile.palette` the page tints with, minus
 * the old lima fallback), the 蔵 kura lockup, the seal with their initials,
 * the name in Newsreader, the @handle, "N COLECCIONES · N SEGUIDORES" in mono,
 * and the fan of the collection that leads the profile (pinned, else newest).
 * Replaces the bare first poster the page's metadata used to point at
 * (file-based metadata wins over `openGraph.images`).
 *
 * GATES — the SAME read as the page (`getPublicProfile`: `isPublic` + handle,
 * public-safe fields, only the escaparate's collections). Private and
 * nonexistent are one identical `no-store` 404, like the page.
 *
 * CACHE — dynamic, `s-maxage=300` without SWR: the privacy window is ~5 min,
 * as the collection preview (see its route).
 */

export const dynamic = "force-dynamic";
export const alt = "Un perfil en kura";
export const size = OG_SIZE;
export const contentType = "image/png";

const LIMA = "#d8ff3e";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) return ogNotFound();

  const lead = profile.backlogs.find((b) => b.pinned) ?? profile.backlogs[0];
  const fan = lead?.fan ?? [];
  const srcs = await Promise.all(fan.map((c) => coverDataUri(c.posterUrl)));
  const n = profile.backlogs.length;
  const f = profile.followerCount;

  return profileOg({
    displayName: profile.displayName,
    username: profile.username,
    meta: `${n} ${n === 1 ? "COLECCIÓN" : "COLECCIONES"} · ${f} ${f === 1 ? "SEGUIDOR" : "SEGUIDORES"}`,
    hexes: profile.palette.filter((h) => h.toLowerCase() !== LIMA),
    covers: fan.map((c, i) => ({ mediaType: c.mediaType, paletteHex: c.paletteHex, src: srcs[i] ?? null })),
  });
}
