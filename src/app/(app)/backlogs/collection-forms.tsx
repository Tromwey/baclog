"use client";

import type { BacklogVisibility } from "@/modules/backlog/visibility";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import {
  deleteBacklogAction,
  renameBacklogAction,
  setBacklogVisibilityAction,
} from "@/app/actions/backlog-actions";
import { SheetClose, useSheetDismiss } from "@/components/ui";
import { FillIcon, KIcon, LOCK_FILL } from "@/components/kura/icons";
import {
  ChoiceRow,
  MenuRow,
  SHEET_FIELD,
  SHEET_QUIET,
  SHEET_SOLID,
  SheetTitle,
} from "@/components/kura/sheet-parts";

/**
 * The sheet bodies a collection shares between the list's hold sheet (10 ·
 * mantener presionado) and the detail's Opciones (18a): editar (O2b),
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

/* ---------------------------------------------------------------- editar */

/**
 * O2b "Editar" — the name (required, 1–60) and the frase: the collection's
 * optional italic line (`vibe`, ≤ 80; saved empty = cleared). The frame's O2b
 * only draws the name ("renombrar"); the row is "Editar" because it edits both.
 */
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
      <SheetTitle>editar</SheetTitle>
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
          aria-label="Frase de la colección (opcional)"
          placeholder="Una frase para esta colección (opcional)"
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

function subscribeNothing() {
  return () => {};
}

/**
 * Compartir (Colecciones formalizado · 1a): the collection's name in
 * Newsreader 24 with "compartir" in mono, then three rows — Historia (the
 * 9:16 card, /backlogs/[id]/card), Copiar link (the public page, its domain
 * as the row's meta) and Más opciones (the system sheet, only where it
 * exists). The card needs no link, so Historia always works.
 *
 * The link is the public page (/u/{handle}/{id}). It only opens for others
 * when the collection isn't private, the account has a handle and the
 * profile is public — otherwise the sheet says which of those is missing and
 * the link rows are off, instead of handing out a link that 404s.
 */
export function ShareBody({
  backlogId,
  name,
  username,
  profilePublic,
  visibility,
}: {
  backlogId: string;
  name: string;
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
  const host = origin.replace(/^https?:\/\//, "");

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

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 px-2.5 pb-2.5">
        <span className="min-w-0 truncate font-brand text-[24px] text-text">{name}</span>
        <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          compartir
        </span>
      </div>
      {blocked && (
        <p className="px-2.5 pb-2 font-sans text-[13px] leading-[1.45] text-text-2 [text-wrap:pretty]">
          {blocked}
        </p>
      )}
      <MenuRow icon="story" label="Historia" aside="9:16" href={`/backlogs/${backlogId}/card`} />
      <MenuRow
        icon="link"
        label={copied ? "Copiado" : "Copiar link"}
        aside={host || undefined}
        onClick={copy}
        disabled={!!blocked || !url}
      />
      {canNativeShare && (
        <MenuRow icon="share" label="Más opciones" onClick={more} disabled={!!blocked || !url} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- borrar */

/**
 * 35a — the ONE confirmation in this flow (it's irreversible). The copy is
 * the frame's, made exact: a title that lives in another collection keeps
 * its state there; this collection is what goes.
 */
export function DeleteBody({ backlogId, name, count }: { backlogId: string; name: string; count: number }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div role="alertdialog" aria-label="Borrar colección" className="flex flex-col gap-1.5 px-0">
      <h2 className="font-brand text-[26px] font-normal leading-[1.1] [text-wrap:balance]">
        ¿borrar {name}?
      </h2>
      <p className="pb-3.5 pt-1 font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
        {failed
          ? "No se pudo borrar. Revisa tu conexión e inténtalo otra vez."
          : count > 0
            ? `Sus ${count} ${count === 1 ? "título conserva su estado" : "títulos conservan su estado"} en tus otras colecciones. Solo se borra esta. No se puede deshacer.`
            : "Solo se borra esta. No se puede deshacer."}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false);
            try {
              await deleteBacklogAction(backlogId);
            } catch (err) {
              // redirect() can surface as a thrown NEXT_REDIRECT — that's success.
              const digest =
                err && typeof err === "object" && "digest" in err ? String(err.digest) : "";
              if (digest.startsWith("NEXT_REDIRECT")) return;
              setFailed(true);
            }
          })
        }
        className={SHEET_SOLID}
      >
        {pending ? "Borrando…" : "Borrar colección"}
      </button>
      <SheetClose className={SHEET_QUIET}>Cancelar</SheetClose>
    </div>
  );
}

/* ------------------------------------------------------------------ head */

/**
 * The head of a collection's Opciones (10b) and of its hold sheet (9a): the
 * name in Newsreader 24 and "N títulos" in mono at the right.
 */
export function CollectionSheetHead({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2.5 pb-2.5">
      <span className="min-w-0 truncate font-brand text-[24px] text-text">{name}</span>
      <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
        {count} {count === 1 ? "título" : "títulos"}
      </span>
    </div>
  );
}
