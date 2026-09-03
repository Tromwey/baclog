import { getCurrentUser } from "@/auth";
import { getAvatarByKey } from "@/modules/avatar/queries";
import { AVATAR_KEY_RE } from "@/modules/avatar/shared";

/**
 * F3.11 — serves a profile photo by its per-upload key.
 *
 * Visibility follows the username's rule: a PUBLIC user's photo is served to
 * anyone holding the URL (it is on their public page anyway); a PRIVATE user's
 * photo is served to that user only — a bad key, a private owner and a
 * stranger all get the same empty 404, so the route is no oracle for anything.
 *
 * Cache-Control is `private`: browsers may keep the bytes for a year (the key
 * rotates on every change, so the URL is truly immutable), but the CDN must
 * NOT — an edge cache would keep serving a photo after its owner went
 * private, and "privado" has to be immediate (the setPublicAction posture).
 * The cost is a function + one row read per cold load, negligible at this
 * scale; revisit with a key rotation on privacy flips if it ever isn't.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!AVATAR_KEY_RE.test(key)) return notFound();

  const row = await getAvatarByKey(key);
  if (!row) return notFound();
  if (!row.isPublic) {
    const viewer = await getCurrentUser();
    if (viewer?.id !== row.userId) return notFound();
  }

  const body = new Uint8Array(row.bytes);
  return new Response(body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      // The bytes were sniffed on upload, but belt and braces: never let a
      // browser reinterpret them, and never let them run anything.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}

function notFound() {
  return new Response(null, { status: 404 });
}
