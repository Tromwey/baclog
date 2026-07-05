import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { getCatalogItem } from "@/modules/catalog/cache";
import {
  resolveMusicLink,
  resolveVideoLink,
  type MusicService,
} from "@/modules/links/resolve";

const paramsSchema = z.object({
  catalogItemId: z.string().uuid(),
  service: z.enum(["spotify", "apple_music", "youtube_music"]).optional(),
});

/**
 * Link-out redirect. Deliberately works WITHOUT a session: public item
 * pages (F2.19) need anonymous viewers to convert. Catalog/media_links are
 * shared cache, not user data — the only per-user input (preferred
 * service) comes from the session when present, or ?service= otherwise.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    catalogItemId: searchParams.get("catalogItemId") ?? "",
    service: searchParams.get("service") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const item = await getCatalogItem(parsed.data.catalogItemId);
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let target: string;
  if (item.mediaType === "album") {
    const user = await getCurrentUser();
    const service: MusicService =
      parsed.data.service ?? user?.preferredService ?? "spotify";
    target = await resolveMusicLink(item, service);
  } else {
    // Vercel provides the viewer's country; local dev defaults to MX
    const region =
      request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "MX";
    target = await resolveVideoLink(item, region);
  }

  return NextResponse.redirect(target, 302);
}
