import { z } from "zod";
import { ApiError, withApi } from "@/authz/api";
import { getOwnCollection } from "@/modules/backlog/collections";
import { paletteHexSchema } from "@/modules/backlog/palette";
import { completePicks, type Pick } from "@/modules/backlog/picks";
import { findCatalogItemByRef, getCatalogItems } from "@/modules/catalog/cache";
import { json, readJson } from "../../../_lib/http";
import { ExternalRefSchema } from "../../../_lib/schemas";
import { toCollection } from "../../../_lib/wire";

const BodySchema = z.object({
  titles: z
    .array(
      z
        .object({
          id: z.string().trim().min(1).max(64).optional(),
          /** Fallback ONLY: used when `id` is not a cached catalog id. */
          externalRef: ExternalRefSchema.optional(),
          paletteHex: paletteHexSchema.optional(),
        })
        .refine((t) => t.id !== undefined || t.externalRef !== undefined, {
          message: "Cada título necesita id o externalRef.",
        }),
    )
    .min(1)
    .max(3),
});

const NOT_IN_CATALOG =
  "Ese título todavía no está en el catálogo. Búscalo de nuevo y vuelve a guardarlo.";

/**
 * POST /api/v1/me/onboarding/picks { titles: [{ id?, externalRef?, paletteHex? }] }
 * (1..3) → { collection: Collection }. "Elige tres": the picks become
 * obsessions inside the account's first collection ("Obsesiones") — or its
 * newest one on re-entry (`modules/backlog/picks.ts`, same rule as the web).
 * Every title is resolved BEFORE anything is written, so a stale id can't
 * leave the first two picks in and fail on the third.
 */
export const POST = withApi(async (request, { user }) => {
  const body = await readJson(request, BodySchema);

  const ids = body.titles.flatMap((t) => (t.id ? [t.id] : []));
  const cached = new Map((await getCatalogItems(ids)).map((r) => [r.id, r]));

  const picks: Pick[] = [];
  for (const t of body.titles) {
    const row =
      (t.id ? cached.get(t.id) : undefined) ??
      (t.externalRef
        ? await findCatalogItemByRef(t.externalRef.source, t.externalRef.externalId)
        : null);
    if (!row) throw new ApiError("not_found", NOT_IN_CATALOG);
    picks.push({ catalogItemId: row.id, paletteHex: t.paletteHex });
  }

  const { backlogId } = await completePicks(user.id, picks);
  const collection = await getOwnCollection(user.id, backlogId);
  if (!collection) throw new ApiError("internal");
  return json({ collection: toCollection(collection) });
});
