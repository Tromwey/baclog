import { ApiError, withApi } from "@/authz/api";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/modules/avatar/shared";
import { removeAvatar, storeAvatar } from "@/modules/avatar/write";
import { json } from "../../_lib/http";
import { freshMe } from "../../_lib/me";

const INVALID_MSG =
  "La foto tiene que ser WebP, JPEG o PNG. Elige otra imagen.";
const TOO_LARGE_MSG = `La foto pesa demasiado. Tiene que quedar por debajo de ${Math.round(
  AVATAR_MAX_BYTES / 1024,
)} KB.`;

/**
 * PUT /api/v1/me/avatar → Me (§4 Cuenta). Two ways to send the bytes:
 * multipart/form-data with a `file` part (what the web picker sends), or the
 * raw image as the body with `Content-Type: image/webp | image/jpeg |
 * image/png` (what the app sends). Either way the server trusts nothing
 * about them: the declared type is only used to pick the parser; size cap
 * and magic-byte sniff live in `modules/avatar/write.ts`, SVG never. The
 * `Me` returned carries the new `avatarUrl` (a fresh `/api/avatar/{key}`).
 */
export const PUT = withApi(async (request, { user }) => {
  const bytes = await readImageBody(request);
  const result = await storeAvatar(user.id, bytes);
  if (!result.ok) {
    throw new ApiError(
      "invalid",
      result.error === "too_large" ? TOO_LARGE_MSG : INVALID_MSG,
      { fields: { file: result.error } },
    );
  }
  return json(await freshMe(user.id));
});

/** DELETE /api/v1/me/avatar → Me with `avatarUrl: null`. Idempotent. */
export const DELETE = withApi(async (_request, { user }) => {
  await removeAvatar(user.id);
  return json(await freshMe(user.id));
});

const RAW_TYPES: ReadonlySet<string> = new Set<string>(AVATAR_TYPES);

async function readImageBody(request: Request): Promise<Uint8Array> {
  const declared = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  // The Content-Length header is a courtesy check that spares reading a huge
  // body; the real cap is re-applied on the bytes in storeAvatar.
  const length = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(length) && length > AVATAR_MAX_BYTES * 2) {
    throw new ApiError("invalid", TOO_LARGE_MSG, { fields: { file: "too_large" } });
  }

  if (declared === "multipart/form-data") {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("invalid", "El formulario no se pudo leer.", {
        fields: { file: "invalid" },
      });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("invalid", "No llegó ninguna imagen. Elige una foto e inténtalo de nuevo.", {
        fields: { file: "invalid" },
      });
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new ApiError("invalid", TOO_LARGE_MSG, { fields: { file: "too_large" } });
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  if (RAW_TYPES.has(declared)) {
    return new Uint8Array(await request.arrayBuffer());
  }

  // Neither a form nor an image body: the app sent something we can't read.
  throw new ApiError("invalid", INVALID_MSG, { fields: { file: "invalid" } });
}
