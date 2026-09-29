"use server";

import { z } from "zod";
import { getCurrentUser } from "@/auth";
import type { CurrentUser } from "@/auth/session";
import { loginPathFor } from "@/lib/return-to";
import { appleDeveloperToken } from "@/modules/music-export/apple-music";
import { assertMusicExportLive, MusicExportError, notConfigured } from "@/modules/music-export/errors";
import {
  getExportState,
  reportAppleMusicExport,
  startExport,
  stepTidalExport,
} from "@/modules/music-export/exports";
import { APPLE_PLAYLIST_ID_RE, parseProvider } from "@/modules/music-export/rules";
import { musicServicesFor } from "@/modules/music-export/services";
import { disconnectTidal } from "@/modules/music-export/tidal-auth";
import { checkRateLimit } from "@/authz/api";
import { partyPath } from "@/modules/party-collections/rules";

/**
 * "Llévala a otra app" — the web's server actions. Thin wrappers: session
 * user → `modules/music-export` with that explicit id. Every rule lives in
 * the module (API v1 reuses it). No `export type` here (learning
 * 2026-09-27-export-type-en-use-server). Nothing here caches or revalidates:
 * exports don't change what any page renders.
 *
 * Every action answers a discriminated object and never throws for an
 * expected outcome:
 *   - `{ error: "signin_required", loginPath }` — no session;
 *   - `{ error: <reason>, message, retryAfterSeconds? }` — the module's
 *     `MusicExportError` (`migration` → mapped to "unavailable",
 *     `not_configured`, `not_connected`, `service_failed`,
 *     `service_rate_limited`, `rate_limited`, `playlist_exists`,
 *     `not_found`, `auth_expired`); `message` is the final Spanish copy;
 *   - `{ error: "invalid" }` — bad input.
 * CONNECTING TIDAL is not an action: navigate to `tidalStartPath(returnTo)`
 * (modules/music-export/rules.ts) → `/api/music/tidal/start?return=…`.
 */

const idSchema = z.string().min(1).max(64);

type SigninRequired = { error: "signin_required"; loginPath: string };

async function sessionOr(backlogId?: string): Promise<CurrentUser | SigninRequired> {
  const user = await getCurrentUser();
  if (user) return user;
  return {
    error: "signin_required" as const,
    loginPath: backlogId ? loginPathFor(partyPath(backlogId)) : "/login",
  };
}

function isUser(u: CurrentUser | SigninRequired): u is CurrentUser {
  return !("error" in u);
}

async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof MusicExportError) {
      return {
        error: err.reason === "migration" ? ("unavailable" as const) : err.reason,
        message: err.message,
        ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
      };
    }
    throw err;
  }
}

/** Which services the sheet can offer ("Próximamente" when `available: false`). */
export async function getMusicServicesAction() {
  const user = await sessionOr();
  if (!isUser(user)) return user;
  return guarded(async () => ({ ok: true as const, services: await musicServicesFor(user.id) }));
}

/** MusicKit JS developer token (public by design); 30/min per user. */
export async function getAppleMusicDeveloperTokenAction() {
  const user = await sessionOr();
  if (!isUser(user)) return user;
  const rl = checkRateLimit(`apple-dev-token:${user.id}`, 30);
  if (!rl.ok) return { error: "rate_limited" as const, retryAfterSeconds: rl.retryAfterSeconds };
  return guarded(async () => {
    assertMusicExportLive();
    const dev = await appleDeveloperToken();
    if (!dev) throw notConfigured("apple_music");
    return { ok: true as const, token: dev.token, expiresAt: dev.expiresAt.toISOString() };
  });
}

/** The export as it stands (no work). */
export async function getPartyExportAction(backlogId: string, provider: string) {
  const user = await sessionOr(backlogId);
  if (!isUser(user)) return user;
  const id = idSchema.safeParse(backlogId);
  const p = parseProvider(provider);
  if (!id.success || !p) return { error: "invalid" as const };
  return guarded(async () => ({ ok: true as const, state: await getExportState(user.id, id.data, p) }));
}

/** "Llévala a {svc}" / "Reintentar": create or resume; re-queues the missing. */
export async function startPartyExportAction(backlogId: string, provider: string) {
  const user = await sessionOr(backlogId);
  if (!isUser(user)) return user;
  const id = idSchema.safeParse(backlogId);
  const p = parseProvider(provider);
  if (!id.success || !p) return { error: "invalid" as const };
  return guarded(async () => ({ ok: true as const, state: await startExport(user.id, id.data, p) }));
}

/** TIDAL: one batch. Loop while `state.status === "in_progress"`. */
export async function stepTidalExportAction(backlogId: string) {
  const user = await sessionOr(backlogId);
  if (!isUser(user)) return user;
  const id = idSchema.safeParse(backlogId);
  if (!id.success) return { error: "invalid" as const };
  return guarded(async () => ({ ok: true as const, state: await stepTidalExport(user.id, id.data) }));
}

/** Apple Music: what MusicKit JS did (playlist created/extended). */
export async function reportAppleMusicExportAction(
  backlogId: string,
  input: { playlistId: string; replace?: boolean; added?: string[]; missing?: string[] },
) {
  const user = await sessionOr(backlogId);
  if (!isUser(user)) return user;
  const parsed = z
    .object({
      id: idSchema,
      playlistId: z.string().regex(APPLE_PLAYLIST_ID_RE),
      replace: z.boolean().optional(),
      added: z.array(idSchema).max(1000).default([]),
      missing: z.array(idSchema).max(1000).default([]),
    })
    .safeParse({ id: backlogId, ...input });
  if (!parsed.success) return { error: "invalid" as const };
  const { id, ...report } = parsed.data;
  return guarded(async () => ({ ok: true as const, state: await reportAppleMusicExport(user.id, id, report) }));
}

/** "Desconectar TIDAL" (idempotent). */
export async function disconnectTidalAction() {
  const user = await sessionOr();
  if (!isUser(user)) return user;
  return guarded(async () => {
    await disconnectTidal(user.id);
    return { ok: true as const };
  });
}
