import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import type { CurrentUser } from "@/auth";

/**
 * Torre de Control gate. Gates on `users.isAdmin` — the OPERATOR role,
 * assigned manually in the DB (today: only the actual founder's account) —
 * and NOT on `isFounder`, which is the F3.2 badge auto-granted to the whole
 * first-100 cohort; gating on the badge would hand every early user the
 * portal. Non-admins get a 404, never a 403 (no oracle that /admin exists),
 * the same discipline as the other authz exceptions. The layout gates the
 * whole segment; every page calls this again anyway (defense in depth —
 * getCurrentUser is per-request cached, so the second check is free).
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}

/**
 * Section-level fetch wrapper: one failing aggregate takes down its card, not
 * the whole portal (the design's per-section error state with REINTENTAR).
 */
export type Fetched<T> = { ok: true; data: T } | { ok: false };

export async function fetched<T>(p: Promise<T>): Promise<Fetched<T>> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    console.error("[admin] metrics query failed:", err);
    return { ok: false };
  }
}
