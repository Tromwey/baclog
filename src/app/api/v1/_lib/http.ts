import "server-only";
import type { z } from "zod";
import { ApiError } from "@/authz/api";

/**
 * Small HTTP helpers for the v1 handlers. `withApi` already stamps
 * `Cache-Control: private, no-store` on whatever a handler returns; these
 * exist so handler bodies stay one-liners and every response is built the
 * same way.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
};

/** 200 (or `status`) JSON. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** 204. */
export function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Parse + validate a JSON body. Malformed JSON → 400 `invalid`; a schema
 * miss throws `ZodError`, which `withApi` maps to 400 `invalid` + `fields`.
 * A body is never trusted for identity — schemas here must not declare a
 * `userId`.
 */
export async function readJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("invalid", "El cuerpo de la petición no es JSON válido.");
  }
  return schema.parse(raw);
}

/** Validate `?query` params against a schema (strings in, typed out). */
export function readQuery<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params);
}

export interface PageParams {
  cursor: string | null;
  limit: number;
}

/** `?cursor=&limit=` with a clamp — never trust a client-chosen page size. */
export function readPage(
  request: Request,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): PageParams {
  const { defaultLimit = 20, maxLimit = 50 } = opts;
  const sp = new URL(request.url).searchParams;
  const rawLimit = Number.parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(maxLimit, Math.max(1, rawLimit))
    : defaultLimit;
  const cursor = sp.get("cursor");
  return { cursor: cursor && cursor.length > 0 ? cursor : null, limit };
}

/**
 * Keyset page from a `limit + 1` fetch: the extra row is how we know a next
 * page exists without a count. `cursorOf` encodes the LAST kept row
 * (`encodeCursor` from modules/reviews/queries.ts).
 */
export function paginate<Row, Out>(
  rows: Row[],
  limit: number,
  serialize: (row: Row) => Out,
  cursorOf: (last: Row) => string,
): { items: Out[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(serialize),
    nextCursor: rows.length > limit && last ? cursorOf(last) : null,
  };
}
