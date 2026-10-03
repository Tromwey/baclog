import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { checkRateLimit } from "@/authz/rate-limit";
import { unifiedSearch } from "@/modules/catalog/search";

const paramsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  tab: z.enum(["film", "series", "album", "all"]).default("all"),
});

/** Searches per signed-in user per minute. Each one can hit TMDB / iTunes /
 *  TIDAL on our keys; a debounced search box stays far below this. In-memory
 *  per instance (`checkRateLimit`). */
const SEARCHES_PER_USER_PER_MINUTE = 90;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rl = checkRateLimit(`catalog-search:u:${user.id}`, SEARCHES_PER_USER_PER_MINUTE);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    q: searchParams.get("q") ?? "",
    tab: searchParams.get("tab") ?? "all",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const started = Date.now();
  // Music searches the viewer's Apple Music store (Vercel's country header,
  // like "dónde ver"); absent locally → `us`.
  const results = await unifiedSearch(
    parsed.data.q,
    parsed.data.tab,
    request.headers.get("x-vercel-ip-country"),
  );
  return NextResponse.json({ results, tookMs: Date.now() - started });
}
