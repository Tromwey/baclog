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
 */
function redirect(request: NextRequest, to: string): NextResponse {
  const res = NextResponse.redirect(to.startsWith("https://") ? to : new URL(to, request.url), 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export async function GET(request: NextRequest) {
  const returnTo = safeMusicReturn(request.nextUrl.searchParams.get("return")) ?? MUSIC_RETURN_FALLBACK;
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
