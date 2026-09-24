import { assertUser } from "@/authz";
import { ApiError, withApi } from "@/authz/api";
import { getRecapMonth } from "@/modules/backlog/recap";
import {
  alsoInMonth,
  ERA_KEY_RE,
  monthYear,
  type RecapTitle,
} from "@/modules/backlog/recap-format";
import { json } from "../../_lib/http";
import { toTitleSummary } from "../../_lib/wire";

/**
 * GET /api/v1/recap/{era} → { era, label, stats, top: Title | null,
 * also: [Title] } (§4 Recap). `era` is `YYYY-MM`; anything else — and a
 * month the user had no activity in — is the same 404, so the path never
 * confirms which months exist beyond what /recap/months already lists.
 * `top` is "lo más tuyo" and `also` the "también en tu mes" strip, both by
 * the exact rule the web screen draws (`pickTop`, `alsoInMonth`).
 */
const titleOf = (t: RecapTitle) =>
  toTitleSummary({
    id: t.catalogItemId,
    title: t.title,
    mediaType: t.mediaType,
    year: t.year,
    byline: t.byline,
    posterUrl: t.posterUrl,
    paletteHex: t.paletteHex,
  });

export const GET = withApi<{ era: string }>(async (_req, { params }) => {
  const user = await assertUser();
  const era = params.era;
  if (typeof era !== "string" || !ERA_KEY_RE.test(era)) {
    throw new ApiError("not_found", "No hay recap de ese mes.");
  }
  const month = await getRecapMonth(user.id, era);
  if (!month) throw new ApiError("not_found", "No hay recap de ese mes.");

  return json({
    era: month.key,
    label: monthYear(month.key),
    stats: {
      completed: month.completed,
      obsessions: month.obsessions,
      reviews: month.reviews,
      saved: month.saved,
    },
    top: month.top ? titleOf(month.top) : null,
    also: alsoInMonth(month).map(titleOf),
  });
});
