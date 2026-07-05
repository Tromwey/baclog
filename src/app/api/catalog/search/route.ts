import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { unifiedSearch } from "@/modules/catalog/search";

const paramsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  tab: z.enum(["film", "series", "album", "all"]).default("all"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
  const results = await unifiedSearch(parsed.data.q, parsed.data.tab);
  return NextResponse.json({ results, tookMs: Date.now() - started });
}
