import { assertUser } from "@/authz";
import { withApi } from "@/authz/api";
import { getRecapMonths } from "@/modules/backlog/recap";
import { monthYear } from "@/modules/backlog/recap-format";
import { json } from "../../_lib/http";

/**
 * GET /api/v1/recap/months → { items: [{ era: "2026-08", label: "agosto 2026" }] }
 * (§4 Recap): every month with activity, newest first — the same list the
 * web's "Meses anteriores" draws (`getRecapMonths`, month = the later of
 * addedAt / statusChangedAt in UTC). Empty when the user has no activity.
 */
export const GET = withApi(async () => {
  const user = await assertUser();
  const months = await getRecapMonths(user.id);
  return json({
    items: months.map((m) => ({ era: m.key, label: monthYear(m.key) })),
  });
});
