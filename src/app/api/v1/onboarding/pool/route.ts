import { z } from "zod";
import { withApi } from "@/authz/api";
import { json, readQuery } from "@/app/api/v1/_lib/http";
import { toTitleSummary } from "@/app/api/v1/_lib/wire";
import {
  POOL_PAGE_COUNT,
  getOnboardingPoolPage,
} from "@/modules/backlog/onboarding-pool";

/**
 * GET /api/v1/onboarding/pool?page=N → { items: [Title], nextPage: number | null }
 * — the "elige tres" grid of the iOS onboarding (32a). Same module as the web
 * route (`api/onboarding/pool`): a curated, user-free pool of providers'
 * titles that warms the shared catalog cache, so it stays behind the bearer
 * like the web keeps it behind the session (no anonymous write amplifier).
 * `page` 1..20 (default 1); anything else is a 400 with `fields.page`.
 */
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(POOL_PAGE_COUNT).default(1),
});

export const GET = withApi(async (req) => {
  const { page } = readQuery(req, QuerySchema);
  const pool = await getOnboardingPoolPage(page);
  return json({
    items: pool.items.map((it) =>
      toTitleSummary({
        id: it.catalogItemId,
        title: it.title,
        mediaType: it.mediaType,
        year: it.year,
        byline: it.byline,
        posterUrl: it.posterUrl,
        paletteHex: it.paletteHex,
      }),
    ),
    nextPage: pool.nextPage,
  });
});
