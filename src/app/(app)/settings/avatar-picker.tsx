"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeAvatarAction,
  uploadAvatarAction,
} from "@/app/actions/avatar-actions";
import { AdnAvatar } from "@/components/adn-avatar";
import { prepareAvatarBlob } from "@/modules/avatar/client";

/**
 * F3.11 foto de perfil — the one place a photo is set or removed (Ajustes ›
 * Cuenta). The file never leaves the device as picked: it is cropped square
 * and resized to 512px in the browser (modules/avatar/client.ts), then sent
 * to the action as a small WebP/JPEG. The disc previews the result the
 * moment the action returns; router.refresh() then pulls the new URL into
 * every server-rendered surface (/perfil, the dock's neighbours, feeds).
 *
 * No photo is a first-class state, not an error: the disc shows the ADN orb
 * and the copy says so. Removing goes back to it with one tap, no confirm —
 * uploading again is just as cheap.
 */
export function AvatarPicker({
  initialUrl,
  hexes,
}: {
  initialUrl: string | null;
  hexes: [string, string];
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
    try {
      const blob = await prepareAvatarBlob(file);
      const form = new FormData();
      form.append("file", blob, "avatar");
      const res = await uploadAvatarAction(form);
      if (res.ok) {
        setUrl(res.url);
        router.refresh();
      } else {
        setError(
          res.error === "too_large"
            ? "La imagen pesa demasiado."
            : "No pudimos usar esa imagen.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === "too-large"
          ? "La imagen pesa demasiado."
          : "No pudimos leer esa imagen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeAvatarAction();
      setUrl(null);
      router.refresh();
    } catch {
      setError("No se pudo quitar la foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center gap-[14px] rounded-xl bg-surface-2 px-4 py-3">
      <AdnAvatar hexes={hexes} src={url} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {url ? "Tu foto" : "Sin foto: tu ADN hace de avatar"}
        </div>
        <p className="mt-0.5 text-xs text-text-3">
          {error ??
            "Se ve en tu perfil y junto a lo que agregas, completas y reseñas."}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/[0.12] disabled:opacity-40"
          >
            {busy ? "Guardando…" : url ? "Cambiar foto" : "Subir foto"}
          </button>
          {url && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-xs text-text-3 underline transition-colors hover:text-text-2 disabled:opacity-40"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
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
