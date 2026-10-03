import { ApiError, withApi } from "@/authz/api";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/modules/avatar/shared";
import { removeAvatar, storeAvatar } from "@/modules/avatar/write";
import { json } from "../../_lib/http";
import { freshMe } from "../../_lib/me";

const UNREADABLE_FORM_MSG = "El formulario no se pudo leer.";
const NO_FILE_MSG = "No llegó ninguna foto. Elige una y vuelve a intentarlo.";
const INVALID_MSG =
  "La foto tiene que ser JPEG, PNG o WebP. Prueba con otra.";
const TOO_LARGE_MSG = "La foto pesa demasiado. Prueba con otra.";

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
    // `fields` is field → message in Spanish (the §1 convention), not a code.
    const message = result.error === "too_large" ? TOO_LARGE_MSG : INVALID_MSG;
    throw new ApiError("invalid", message, { fields: { file: message } });
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
    throw new ApiError("invalid", TOO_LARGE_MSG, { fields: { file: TOO_LARGE_MSG } });
  }

  if (declared === "multipart/form-data") {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError("invalid", UNREADABLE_FORM_MSG, { fields: { file: UNREADABLE_FORM_MSG } });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("invalid", NO_FILE_MSG, { fields: { file: NO_FILE_MSG } });
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new ApiError("invalid", TOO_LARGE_MSG, { fields: { file: TOO_LARGE_MSG } });
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  if (RAW_TYPES.has(declared)) {
    return new Uint8Array(await request.arrayBuffer());
  }

  // Neither a form nor an image body: the app sent something we can't read.
  throw new ApiError("invalid", INVALID_MSG, { fields: { file: INVALID_MSG } });
}
