import { ApiError, withApi } from "@/authz/api";

/**
 * PUT /api/v1/me/titles/{id}/episodes/{key} → 501 `unsupported` (§4). There
 * is no per-episode model server-side; the app keeps watched episodes local.
 * Bearer-gated on purpose so an unauthenticated probe still sees a 401, not
 * a hint about what exists.
 */
export const PUT = withApi<{ id: string; key: string }>(async () => {
  throw new ApiError("unsupported");
});

export const DELETE = withApi<{ id: string; key: string }>(async () => {
  throw new ApiError("unsupported");
});
