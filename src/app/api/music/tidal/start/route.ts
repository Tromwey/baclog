import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/auth";
import { loginPathFor } from "@/lib/return-to";
import { MusicExportError } from "@/modules/music-export/errors";
import { MUSIC_RETURN_FALLBACK, musicLanding, safeMusicReturn } from "@/modules/music-export/rules";
import { startTidalAuth } from "@/modules/music-export/tidal-auth";

/**
 * GET /api/music/tidal/start?return=/c/{id}|/settings|/settings/musica — the
 * WEB entry of "Conectar TIDAL" (a plain navigation: the browser carries the
 * session cookie). 302 to TIDAL's consent page; the state is bound to this
 * cookie user and the callback only finishes for the same session.
 *
 * Never an error page: no session → /login (back to the party when `return`
 * is one); switch off / not configured / too many → 302 to
 * `{return}?music=tidal&connected=0&reason=unavailable|rate_limited`.
 * `return` outside the whitelist → `/settings/musica`.
 *
 * Only a navigation that starts ON kura (or typed / bookmarked) may begin
 * the dance: `Sec-Fetch-Site` must be `same-origin` or `none`. A cross-site
 * link or auto-submitted form lands back on `return` without starting
 * anything (no state row, no TIDAL redirect). Browsers that don't send the
 * header (old Safari) pass — the state is bound to the cookie user either way.
 * It stays a GET: the "Conectar TIDAL" button is a plain navigation, and a
 * POST form would change nothing this check doesn't already give.
 */
function redirect(request: NextRequest, to: string): NextResponse {
  const res = NextResponse.redirect(to.startsWith("https://") ? to : new URL(to, request.url), 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

export async function GET(request: NextRequest) {
  const returnTo = safeMusicReturn(request.nextUrl.searchParams.get("return")) ?? MUSIC_RETURN_FALLBACK;
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && !ALLOWED_FETCH_SITES.has(site)) {
    console.warn(`[music-export] tidal web start refused: sec-fetch-site=${site.slice(0, 20)}`);
    return redirect(request, returnTo);
  }
  const user = await getCurrentUser();
  if (!user) return redirect(request, loginPathFor(returnTo));
  try {
    return redirect(request, await startTidalAuth(user.id, "web", returnTo));
  } catch (err) {
    if (err instanceof MusicExportError) {
      const reason = err.code === "rate_limited" ? "rate_limited" : "unavailable";
      return redirect(request, musicLanding(returnTo, false, reason));
    }
    console.error("[music-export] tidal web start failed", err instanceof Error ? err.name : "error");
    return redirect(request, musicLanding(returnTo, false, "unavailable"));
  }
}
