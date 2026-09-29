import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/auth";
import { checkRateLimit, clientIp } from "@/authz/api";
import { MIGRATION_0034_LIVE } from "@/modules/music-export/live";
import {
  iosAuthorizedUrl,
  iosFailedUrl,
  MUSIC_RETURN_FALLBACK,
  musicLanding,
} from "@/modules/music-export/rules";
import { clientOfState } from "@/modules/music-export/pkce";
import { handleTidalCallback } from "@/modules/music-export/tidal-auth";

/**
 * GET /api/music/tidal/callback?code=…&state=…[&error=…] — TIDAL's
 * redirect_uri (register EXACTLY this URL in the TIDAL dashboard and in
 * `TIDAL_OAUTH_REDIRECT_URI`). Always a 302, never a page:
 *   - web state (`w…`): finishes only for the cookie session that started
 *     it → `{return}?music=tidal&connected=1`, else `connected=0&reason=
 *     denied|expired|session|exchange|unavailable`;
 *   - iOS state (`i…`): parks the code (encrypted) and bounces to
 *     `kura://music/tidal/authorized?ref=…` (the app finishes with its
 *     bearer), or `kura://music/tidal/connected?ok=0&reason=…`.
 * The URL carries a one-time code: `no-store` + `Referrer-Policy:
 * no-referrer`, and the code/state never reach a log line.
 */
function redirect(request: NextRequest, to: string): NextResponse {
  const res = NextResponse.redirect(/^[a-z]+:\/\//.test(to) ? to : new URL(to, request.url), 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const state = q.get("state");
  const client = state ? clientOfState(state) : null;
  const fail = (reason: string) =>
    client === "ios" ? iosFailedUrl(reason) : musicLanding(MUSIC_RETURN_FALLBACK, false, reason);

  const rl = checkRateLimit(`tidal-callback-ip:${clientIp(request)}`, 30);
  if (!rl.ok) return redirect(request, fail("rate_limited"));
  if (!MIGRATION_0034_LIVE) return redirect(request, fail("unavailable"));

  try {
    const sessionUser = client === "web" ? await getCurrentUser() : null;
    const out = await handleTidalCallback(
      { state, code: q.get("code"), error: q.get("error") },
      sessionUser?.id ?? null,
    );
    if (out.client === "ios") {
      return redirect(request, out.ok ? iosAuthorizedUrl(out.ref) : iosFailedUrl(out.reason));
    }
    const path = out.returnTo ?? MUSIC_RETURN_FALLBACK;
    return redirect(request, out.ok ? musicLanding(path, true) : musicLanding(path, false, out.reason));
  } catch (err) {
    console.error("[music-export] tidal callback failed", err instanceof Error ? err.name : "error");
    return redirect(request, fail("unavailable"));
  }
}
