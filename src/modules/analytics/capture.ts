import "server-only";
import { db } from "@/db";
import { analyticsEvents, analyticsEventTypeEnum, deviceClassEnum } from "@/db/schema";

type EventType = (typeof analyticsEventTypeEnum.enumValues)[number];
type DeviceClass = (typeof deviceClassEnum.enumValues)[number];

/** Coarse country from Vercel's edge header — never resolves IP ourselves. */
function parseCountry(headers: Headers): string | null {
  const c = headers.get("x-vercel-ip-country");
  return c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null;
}

/** Coarse device bucket from UA — the raw UA string is never stored. */
function parseDeviceClass(headers: Headers): DeviceClass {
  const ua = (headers.get("user-agent") ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mozilla|chrome|safari|firefox|edge/.test(ua) && !/mobile/.test(ua))
    return "desktop";
  return "other";
}

/**
 * F3.4 — the single write path for analytics_event (choke point, like authz).
 * Pilar 4: stores only coarse country + device bucket + (for public views)
 * the target username; never raw IP/UA, never a per-viewer id/cookie for
 * anonymous traffic. Callers invoke this fire-and-forget (void, wrapped in
 * try/catch) so a DB hiccup never breaks a page render.
 */
export async function recordEvent(input: {
  eventType: EventType;
  userId?: string | null;
  targetUsername?: string | null;
  headers: Headers;
}): Promise<void> {
  await db.insert(analyticsEvents).values({
    eventType: input.eventType,
    userId: input.userId ?? null,
    targetUsername: input.targetUsername ?? null,
    country: parseCountry(input.headers),
    device: parseDeviceClass(input.headers),
  });
}

/** Convenience for server components: fire-and-forget, never throws upward. */
export function captureView(input: {
  eventType: EventType;
  userId?: string | null;
  targetUsername?: string | null;
  headers: Headers;
}): void {
  void recordEvent(input).catch((err) =>
    console.error("[analytics] capture failed:", err),
  );
}
