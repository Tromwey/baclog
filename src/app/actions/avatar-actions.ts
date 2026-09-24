"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/authz";
import { AVATAR_MAX_BYTES } from "@/modules/avatar/shared";
import { removeAvatar, storeAvatar } from "@/modules/avatar/write";

/**
 * F3.11 foto de perfil — thin wrappers over `modules/avatar/write.ts`
 * (`assertUser()` → module → revalidate). The size cap and the magic-byte
 * sniff live in the module, shared with `PUT /api/v1/me/avatar`; the early
 * `file.size` check here only spares reading a huge body into memory.
 */
export type UploadAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid" | "too_large" };

export async function uploadAvatarAction(
  formData: FormData,
): Promise<UploadAvatarResult> {
  const user = await assertUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "too_large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await storeAvatar(user.id, bytes);
  if (!result.ok) return result;

  revalidateAvatarSurfaces(user.username);
  return result;
}

export async function removeAvatarAction() {
  const user = await assertUser();
  await removeAvatar(user.id);
  revalidateAvatarSurfaces(user.username);
  return { ok: true as const };
}

/** The pages that render the viewer's own photo; the public tree too, so a
 *  change is immediate for visitors and not whenever its cache expires. */
function revalidateAvatarSurfaces(username: string | null) {
  revalidatePath("/perfil");
  revalidatePath("/settings");
  if (username) revalidatePath(`/u/${username}`, "layout");
}
