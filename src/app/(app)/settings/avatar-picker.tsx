"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeAvatarAction,
  uploadAvatarAction,
} from "@/app/actions/avatar-actions";
import { ATTEMPT_UNREACHED, attempt } from "@/components/kura/attempt";
import { ProfileAvatar } from "@/components/profile-avatar";
import { prepareAvatarBlob } from "@/modules/avatar/client";

/**
 * F3.11 foto de perfil — the one place a photo is set or removed, at the top
 * of Editar perfil (Kura 20f): the disc at 104 and "Cambiar foto" under it.
 * The file never leaves the device as picked: it is cropped square and
 * resized to 512px in the browser (modules/avatar/client.ts), then sent to
 * the action as a small WebP/JPEG. The disc previews the result the moment
 * the action returns; router.refresh() then pulls the new URL into every
 * server-rendered surface.
 *
 * It saves AT ONCE — a photo is not part of the form's "Guardar" — and
 * removing goes back to the seal with one tap, no confirm (uploading again
 * is just as cheap).
 */
export function AvatarPicker({
  initialUrl,
  hexes,
  name,
}: {
  initialUrl: string | null;
  /** The palette the seal is drawn from (the profile's tint). */
  hexes: string[];
  name: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Same input can be used again for the same file — clear it now.
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    // Two different failures, two different sentences: the PHOTO couldn't be
    // read (pick another one) vs. the upload never landed (same photo, try
    // again).
    let blob: Blob;
    try {
      blob = await prepareAvatarBlob(file);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "too-large"
          ? "La foto pesa demasiado. Prueba con otra."
          : "No se pudo usar esa foto. Prueba con otra.",
      );
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.append("file", blob, "avatar");
    const res = await attempt(() => uploadAvatarAction(form));
    setBusy(false);
    if (res.ok) {
      setUrl(res.value.url);
      router.refresh();
      return;
    }
    setError(
      res.error === ATTEMPT_UNREACHED
        ? "No se pudo subir la foto. Revisa tu conexión y vuelve a intentarlo."
        : res.error === "too_large"
          ? "La foto pesa demasiado. Prueba con otra."
          : "No se pudo usar esa foto. Prueba con otra.",
    );
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeAvatarAction();
      setUrl(null);
      router.refresh();
    } catch {
      setError("No se pudo quitar la foto. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={url ? "Cambiar foto" : "Agregar foto"}
        className="rounded-full bl-press-lg disabled:opacity-60"
      >
        <ProfileAvatar src={url} hexes={hexes} name={name} size={104} />
      </button>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex min-h-11 items-center text-[15px] font-semibold text-text transition-opacity active:opacity-60 disabled:opacity-40"
        >
          {busy ? "Guardando…" : url ? "Cambiar foto" : "Agregar foto"}
        </button>
        {url && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="flex min-h-11 items-center text-[15px] text-text-2 transition-[color,opacity] hover:text-text active:opacity-60 disabled:opacity-40"
          >
            Quitar
          </button>
        )}
      </div>
      {/* Always mounted: a live region born WITH its text isn't announced.
          Empty, it gives back the column's gap instead of `display: none`. */}
      <p role="status" className="text-center text-[13px] leading-[1.4] text-text-2 empty:-mt-2">
        {error}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
        aria-label="Elegir foto de perfil"
      />
    </div>
  );
}
