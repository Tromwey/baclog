"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  renameBacklogAction,
  setBacklogVisibilityAction,
  type BacklogVisibility,
} from "@/app/actions/backlog-actions";
import { useSheetDismiss } from "@/components/ui";
import { tintCard } from "@/components/kura/tint";
import { FillIcon, KIcon, LOCK_FILL, DotsIcon } from "@/components/kura/icons";
import {
  ChoiceRow,
  SHEET_FIELD,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";
import type { MediaType } from "@/modules/catalog/types";

/**
 * The sheet bodies a collection shares between the list's hold sheet (10 ·
 * mantener presionado) and the detail's Opciones (18a): renombrar (O2b),
 * quién la ve (K1a) and compartir (O5). Bodies, not sheets — "nunca dos
 * hojas a la vez": the caller swaps its one sheet's content to these.
 */

/* ------------------------------------------------------------ privacidad */

/**
 * K1a mapped onto the product (F3.10.1). The frame draws Pública /
 * Seguidores / Solo yo; the product has `is_public` + `show_on_profile`, so:
 * Pública = public AND on the profile (the default), "Seguidores" does not
 * exist (omitted — K1b was never built), Solo yo = private. The third state
 * the product DOES have — public by link but off the profile — keeps its row
 * as "Con el link".
 */
export const VISIBILITY_LABEL: Record<BacklogVisibility, string> = {
  featured: "Pública",
  public: "Con el link",
  private: "Solo yo",
};

const CHOICES: {
  id: BacklogVisibility;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "featured",
    icon: <KIcon name="globe" size={18} strokeWidth={1.8} />,
    description: "En tu perfil y con el link, con o sin cuenta.",
  },
  {
    id: "public",
    icon: <KIcon name="link" size={18} strokeWidth={1.8} />,
    description: "Fuera de tu perfil. La abre quien tenga el link.",
  },
  {
    id: "private",
    icon: <FillIcon d={LOCK_FILL} size={18} />,
    description: "Solo tú. No aparece en tu perfil y el link no abre.",
  },
];

export function PrivacyChoices({
  value,
  onSelect,
  disabled,
}: {
  value: BacklogVisibility;
  onSelect: (v: BacklogVisibility) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="flex flex-col">
      {CHOICES.map((c) => (
        <ChoiceRow
          key={c.id}
          icon={c.icon}
          label={VISIBILITY_LABEL[c.id]}
          description={c.description}
          on={value === c.id}
          disabled={disabled}
          onSelect={() => onSelect(c.id)}
        />
      ))}
    </div>
  );
}

/**
 * K1a as a sheet body: picking a row saves at once (no confirm — it's
 * reversible), then the sheet closes.
 */
export function PrivacyBody({
  backlogId,
  name,
  value,
  onSaved,
}: {
  backlogId: string;
  name: string;
  value: BacklogVisibility;
  onSaved: (v: BacklogVisibility) => void;
}) {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [current, setCurrent] = useState(value);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(v: BacklogVisibility) {
    if (v === current) return;
    const prev = current;
    setCurrent(v);
    setFailed(false);
    startTransition(async () => {
      const res = await setBacklogVisibilityAction(backlogId, v).catch(() => null);
      if (!res || !("ok" in res)) {
        setCurrent(prev);
        setFailed(true);
        return;
      }
      onSaved(v);
      router.refresh();
      dismiss?.();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SheetTitle close={false}>quién ve {name}</SheetTitle>
      <PrivacyChoices value={current} onSelect={pick} disabled={pending} />
      {failed && (
        <p className="px-1 pt-1 font-sans text-[13px] text-text-2">
          No se pudo guardar. Revisa tu conexión y vuelve a elegir.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- renombrar */

/** O2b — the name (and the product's optional vibe line, which the frame doesn't draw). */
export function RenameBody({
  backlogId,
  name: currentName,
  vibe: currentVibe,
}: {
  backlogId: string;
  name: string;
  vibe: string | null;
}) {
  const router = useRouter();
  const dismiss = useSheetDismiss();
  const [name, setName] = useState(currentName);
  const [vibe, setVibe] = useState(currentVibe ?? "");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setFailed(false);
    startTransition(async () => {
      const res = await renameBacklogAction(backlogId, name, vibe).catch(() => null);
      if (!res || !("ok" in res)) {
        setFailed(true);
        return;
      }
      router.refresh();
      dismiss?.();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-1.5"
    >
      <SheetTitle>renombrar</SheetTitle>
      <div className="mt-1.5 flex flex-col gap-3.5">
        <div className="relative">
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre de la colección"
            placeholder="Nombre"
            className={`${SHEET_FIELD} pr-12`}
          />
          {name && (
            <button
              type="button"
              aria-label="Borrar el nombre"
              onClick={() => setName("")}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-text-2"
            >
              <KIcon name="close" size={14} />
            </button>
          )}
        </div>
        <input
          maxLength={80}
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          aria-label="Descripción (opcional)"
          placeholder="Una línea que la describa (opcional)"
          className="h-[52px] w-full rounded-[16px] bg-[var(--glass-bg)] px-[18px] font-sans text-[16px] text-text outline-none transition-colors placeholder:text-text-3 focus:bg-white/[0.11]"
        />
        <span className="px-1 font-sans text-[13px] leading-[1.5] text-text-2">
          {failed
            ? "No se pudo guardar. Revisa tu conexión e inténtalo otra vez."
            : "Los links que ya compartiste siguen funcionando."}
        </span>
        <button type="submit" disabled={pending || !name.trim()} className={SHEET_SOLID}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- compartir */

export interface ShareCover {
  posterUrl: string | null;
  paletteHex: readonly string[] | null;
  mediaType: MediaType;
}

function subscribeNothing() {
  return () => {};
}

/**
 * O5 — the preview card (spine, three covers, "de @handle · N títulos", the
 * link in mono) and three round actions: Copiar link, Historia (the
 * exportable card at /backlogs/[id]/card) and Más (the system share sheet,
 * only where it exists).
 *
 * The link is the public page (/u/{handle}/{id}). It only opens for others
 * when the collection isn't private, the account has a handle and the
 * profile is public — otherwise the sheet says which of those is missing
 * instead of handing out a link that 404s.
 */
export function ShareBody({
  backlogId,
  name,
  count,
  covers,
  paletteHex,
  username,
  profilePublic,
  visibility,
}: {
  backlogId: string;
  name: string;
  count: number;
  covers: ShareCover[];
  paletteHex: readonly string[];
  username: string | null;
  profilePublic: boolean;
  visibility: BacklogVisibility;
}) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => "",
  );
  const canNativeShare = useSyncExternalStore(
    subscribeNothing,
    () => typeof navigator.share === "function",
    () => false,
  );

  const path = username ? `/u/${username}/${backlogId}` : null;
  const blocked =
    visibility === "private"
      ? "Es solo tuya. Cámbiala en Privacidad para compartir el link."
      : !username
        ? "Elige tu usuario en Ajustes para tener un link."
        : !profilePublic
          ? "Tu perfil es privado: el link no abre para nadie más."
          : null;
  const url = path && origin ? `${origin}${path}` : null;
  const shown = path ? `${origin.replace(/^https?:\/\//, "")}${path}` : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function more() {
    if (!url) return;
    try {
      await navigator.share({ title: name, url });
    } catch {
      /* dismissed */
    }
  }

  const ACTION =
    "flex flex-1 flex-col items-center gap-2 font-sans text-[13px] font-medium text-text disabled:opacity-40";
  const DISC =
    "flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--glass-bg)] bl-press";

  return (
    <div className="flex flex-col gap-1.5">
      <SheetTitle close={false}>compartir</SheetTitle>
      <div
        className="flex overflow-hidden rounded-[22px]"
        style={{ background: covers.length ? tintCard(paletteHex) : "var(--surface-1)" }}
      >
        <span className="flex w-10 flex-none items-center justify-center bg-black/[0.24]">
          <span
            className="max-h-[150px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] tracking-[0.14em] text-text"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {name}
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex gap-2">
            {covers.slice(0, 3).map((c, i) => (
              <span
                key={i}
                className="relative block h-[72px] w-[72px] flex-none overflow-hidden rounded-[10px] bg-surface-2 shadow-cover"
              >
                {c.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- hotlinked CDN (ADR-007)
                  <img src={c.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
            ))}
            {covers.length === 0 && (
              <span className="h-[72px] w-[72px] rounded-[10px] bg-[var(--glass-bg)]" />
            )}
          </div>
          <span className="font-sans text-[13px] text-text-2">
            {username ? `de @${username} · ` : ""}
            {count} {count === 1 ? "título" : "títulos"}
          </span>
          {blocked ? (
            <span className="font-sans text-[13px] leading-[1.45] text-text">{blocked}</span>
          ) : (
            <span className="truncate font-mono text-[12px] text-text">{shown}</span>
          )}
        </div>
      </div>
      <div className="mt-[18px] flex gap-2">
        <button type="button" onClick={copy} disabled={!!blocked || !url} className={ACTION}>
          <span className={DISC}>
            <KIcon name="link" size={20} />
          </span>
          {copied ? "Copiado" : "Copiar link"}
        </button>
        <Link href={`/backlogs/${backlogId}/card`} className={ACTION}>
          <span className={DISC}>
            <KIcon name="story" size={20} />
          </span>
          Historia
        </Link>
        {canNativeShare && (
          <button type="button" onClick={more} disabled={!!blocked || !url} className={ACTION}>
            <span className={DISC}>
              <DotsIcon size={20} />
            </span>
            Más
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ meta */

/** "24 · álbum" / "31 · mixto" — the hold sheet's mono meta. */
export function kindMeta(count: number, byKind: Record<MediaType, { total: number }>): string {
  const kinds = (Object.keys(byKind) as MediaType[]).filter((k) => byKind[k].total > 0);
  const word =
    kinds.length === 1
      ? { film: "cine", series: "series", album: "álbum" }[kinds[0]]
      : kinds.length === 0
        ? "vacía"
        : "mixto";
  return `${count} · ${word}`;
}
