import "server-only";
import { z } from "zod";
import { ApiError } from "@/authz/api";
import { parseHandleOrNull } from "@/modules/account/username";
import { decodeCursor } from "@/modules/reviews/queries";
// Side effect only: `schemas.ts` configures zod's Spanish locale once. Every
// handler that parses input goes through this file, so the copy a ZodError
// carries is Spanish even in a route that never imports a wire schema.
import "./schemas";

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

const NOT_JSON = "El cuerpo de la petición no es JSON válido.";

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
    throw new ApiError("invalid", NOT_JSON);
  }
  return schema.parse(raw);
}

/** `readJson` for verbs whose body is optional (`PUT` membership): no body
 *  or a whitespace-only body parses as `{}`. */
export async function readOptionalJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const text = (await request.text()).trim();
  if (text.length === 0) return schema.parse({});
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError("invalid", NOT_JSON);
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?cursor=` for the keyset lists (feed, following, followers, a title's
 * reviews). Absent or empty → page 1. Present but not decodable → 400
 * `invalid` with `fields.cursor`: a cursor the app didn't get from us is a
 * client bug, and silently re-serving page 1 would hide it as an endless
 * first page. `decodeCursor` checks the instant half (exactly what
 * `encodeCursor` emits, year ≥ 2000); `uuidId` also requires the id half to
 * be a UUID, for lists whose cursor id is a plain row id (`item_review.id`).
 * The feed's ids are composite (`reviewed:<uuid>`), so it can't use it. None
 * of the modules behind these lists take a page size (the chunk is theirs),
 * so there is no `limit` here on purpose.
 */
export function readCursor(
  request: Request,
  opts: { uuidId?: boolean } = {},
): string | null {
  const raw = new URL(request.url).searchParams.get("cursor");
  if (!raw) return null;
  const decoded = decodeCursor(raw);
  if (decoded === null || (opts.uuidId && !UUID_RE.test(decoded.id))) {
    throw new ApiError("invalid", "El cursor de paginación no es válido. Vuelve a cargar la lista desde el principio.", {
      fields: { cursor: "Cursor no válido" },
    });
  }
  return raw;
}

/** The id if it is UUID-shaped, else null — for lookups that fall back to
 *  something else (the membership PUT's `externalRef`). */
export function uuidOrNull(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}

/**
 * A `{id}` path segment (collections, titles). Every id in the DB is a UUID
 * (stored as text), so anything else can't exist: it is the SAME 404 as an
 * unknown id, never a 400 — a validation error on the path would tell a
 * prober which strings are even worth trying.
 */
export function parseId(raw: string | string[] | undefined): string {
  const id = uuidOrNull(raw);
  if (!id) throw new ApiError("not_found");
  return id;
}

/**
 * A `{handle}` path segment, normalized through the one username grammar
 * (`modules/account/username.ts`: trim, lowercase, no `@`). Malformed →
 * the same 404 a private or nonexistent handle gets (no oracle).
 */
export function parseHandle(raw: string | string[] | undefined): string {
  const handle = parseHandleOrNull(typeof raw === "string" ? raw : null);
  if (!handle) throw new ApiError("not_found");
  return handle;
}
