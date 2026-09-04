import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import {
  POOL_PAGE_COUNT,
  getOnboardingPoolPage,
} from "@/modules/backlog/onboarding-pool";

/**
 * Onboarding pool pages after the first (page 1 is server-rendered by
 * /onboarding). Session-gated like /api/catalog/search — the data is
 * provider-derived and user-free, but the route warms the shared catalog
 * cache and shouldn't be an anonymous write amplifier.
 *
 * GET ?page=N → { items: OnboardingPoolItem[], nextPage: number | null }
 */
const paramsSchema = z.object({
  page: z.coerce.number().int().min(1).max(POOL_PAGE_COUNT),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = paramsSchema.safeParse({ page: searchParams.get("page") ?? "1" });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_page" }, { status: 400 });
  }

  const page = await getOnboardingPoolPage(parsed.data.page);
  return NextResponse.json(page);
}
