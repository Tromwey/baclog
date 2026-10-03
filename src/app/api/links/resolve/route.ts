import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { checkRateLimit, clientIp } from "@/authz/rate-limit";
import { getCatalogItem } from "@/modules/catalog/cache";
import {
  resolveMusicLink,
  resolveVideoLink,
  type MusicService,
} from "@/modules/links/resolve";

const paramsSchema = z.object({
  catalogItemId: z.string().uuid(),
  service: z
    .enum(["spotify", "apple_music", "youtube_music", "tidal"])
    .optional(),
});

/**
 * Link-out redirect. Deliberately works WITHOUT a session: public item
 * pages (F2.19) need anonymous viewers to convert. Catalog/media_links are
 * shared cache, not user data — the only per-user input (preferred
 * service) comes from the session when present, or ?service= otherwise.
 *
 * Anonymous AND it can fan out to third-party lookups on a cache miss
 * (`resolveMusicLink` / `resolveVideoLink`), so it is rate limited by IP
 * before anything else runs (in-memory per instance — it stops one client
 * from using us as a proxy to burn the providers' quota).
 */
const RESOLVES_PER_IP_PER_MINUTE = 60;

export async function GET(request: Request) {
  const rl = checkRateLimit(`link-resolve-ip:${clientIp(request)}`, RESOLVES_PER_IP_PER_MINUTE);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }
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

  // Vercel provides the viewer's country; local dev defaults to MX. Video
  // caches per region (providers differ); music only scopes its search by it.
  const region =
    request.headers.get("x-vercel-ip-country")?.toUpperCase() ?? "MX";

  let target: string;
  if (item.mediaType === "album") {
    const user = await getCurrentUser();
    const service: MusicService =
      parsed.data.service ?? user?.preferredService ?? "spotify";
    target = await resolveMusicLink(item, service, region);
  } else {
    target = await resolveVideoLink(item, region);
  }

  return NextResponse.redirect(target, 302);
}
