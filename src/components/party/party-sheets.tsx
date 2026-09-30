"use client";

import { useState } from "react";
import {
  deletePartyAction,
  leavePartyAction,
  removeAndBlockPartyGuestAction,
  removePartySongAction,
  revokePartyInviteAction,
  rotatePartyInviteAction,
  unblockPartyGuestAction,
  updatePartyAction,
} from "@/app/actions/party-collection-actions";
import { MenuRow, SHEET_FIELD, SHEET_QUIET, SHEET_SOLID, SheetTitle } from "@/components/kura/sheet-parts";
import type { ToastHost } from "@/components/kura/toast";
import { SheetClose, useSheetDismiss } from "@/components/ui";
import { COLLECTION_NAME_MAX } from "@/modules/backlog/name-limit";
import type { PartyDetail, PartySong } from "@/modules/party-collections/types";
import { LimitStepper } from "./limit-stepper";
import { logged, usePartyFailure } from "./party-errors";
import {
  creditOf,
  handleOf,
  PartyFan,
  PersonSeal,
  putPhrase,
  shortDate,
  songsLabel,
  SongCover,
  yourSongs,
} from "./party-parts";

/**
 * The party's sheets (fiesta-app-v2 · sheets): ONE <Sheet> at a time whose
 * content swaps ("Nunca dos hojas a la vez" — sheet.tsx), so every body here
 * is the INSIDE of a sheet the member page owns.
 */

export type SheetState =
  | { k: "welcome"; back: boolean }
  | { k: "cap" }
  | { k: "remove"; titleId: string }
  | { k: "share" }
  | { k: "link" }
  | { k: "opts" }
  | { k: "export" }
  | { k: "edit" }
  | { k: "delete" }
  | { k: "blocked" }
  | { k: "guestOpts" }
  | { k: "leave" };

export const SHEET_LABEL: Record<SheetState["k"], string> = {
  welcome: "Ya estás dentro",
  cap: "Tus canciones",
  remove: "Quitar canción",
  share: "Invita a la fiesta",
  link: "El link",
  opts: "Opciones de la fiesta",
  export: "Llévala a otra app",
  edit: "Editar fiesta",
  delete: "Borrar fiesta",
  blocked: "Bloqueados",
  guestOpts: "Opciones de la fiesta",
  leave: "Salir de la fiesta",
};

const HONEY =
  "flex h-14 w-full items-center justify-center rounded-full bg-honey px-5 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press disabled:opacity-60";
const QUIET_52 =
  "flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--glass-bg)] px-5 font-sans text-[15px] font-semibold text-text bl-press disabled:opacity-60";
const CANCEL =
  "flex h-12 w-full items-center justify-center rounded-full font-sans text-[15px] font-medium text-text-2 transition-colors active:bg-white/[0.06]";
const BIG_TITLE = "font-brand text-[34px] font-normal leading-[1.02] tracking-[-0.015em] text-text [text-wrap:balance]";
const BODY = "mt-2.5 font-sans text-[15px] leading-[1.45] text-text-2 [text-wrap:pretty]";

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- welcome */

export function WelcomeSheet({
  party,
  handle,
  back,
  onSearch,
}: {
  party: PartyDetail;
  handle: string | null;
  back: boolean;
  onSearch: () => void;
}) {
  const dismiss = useSheetDismiss();
  const host = party.host ? `la fiesta de @${party.host.handle}` : "la fiesta";
  const put = putPhrase(party.perGuestLimit);
  const title = back && handle ? `ya estás dentro, @${handle}.` : "ya estás dentro.";
  const body = back
    ? `Entraste con tu cuenta de kura. ${put ? `${put} en ${host}; todos ven quién puso cuál.` : `Ya ves ${host} en vivo.`}`
    : `Eres parte de ${host}. ${put ? `${put}; todos ven quién puso cuál y las escuchan esa noche.` : "Aquí ves la colección en vivo."}`;
  return (
    <div className="flex flex-col">
      <PartyFan songs={party.songs} empty={party.songs.length === 0} lead={50} />
      <h2 className={`mt-[18px] ${BIG_TITLE}`}>{title}</h2>
      <p className={BODY}>{body}</p>
      {party.viewer.canAdd ? (
        <>
          <button type="button" onClick={onSearch} className={`mt-6 ${HONEY}`}>
            Buscar mi primera canción
          </button>
          <SheetClose className={`mt-1 ${CANCEL}`}>Ver la colección primero</SheetClose>
        </>
      ) : (
        <button type="button" onClick={() => dismiss?.()} className={`mt-6 ${HONEY}`}>
          Ver la colección
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- cap */

/** "ya pusiste tus 3." — Quitar per own song, and Listo. */
export function CapSheet({
  party,
  onParty,
  onRemoved,
  onDone,
  toast,
}: {
  party: PartyDetail;
  onParty: (p: PartyDetail) => void;
  /** A song was removed here: close the sheet and go (back) to the search. */
  onRemoved: () => void;
  onDone: () => void;
  toast: ToastHost;
}) {
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = party.songs.filter((s) => s.mine);
  const remove = async (s: PartySong) => {
    setBusy(s.titleId);
    const res = await logged("remove song", party.id, removePartySongAction(party.id, s.titleId));
    setBusy(null);
    if (res && "ok" in res && res.ok) {
      onParty(res.party);
      toast.show({ message: `Quitaste ${s.title}.` });
      onRemoved();
      return;
    }
    fail(res, "No pudimos quitarla. Inténtalo otra vez.");
  };
  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>ya pusiste {yourSongs(party.perGuestLimit)}.</h2>
      <p className={BODY}>
        Si quieres cambiar una, quítala aquí y busca otra. Las demás siguen en la colección.
      </p>
      <ul className="-mx-2 mt-[18px] flex flex-col gap-0.5">
        {mine.map((s) => (
          <li key={s.titleId} className="flex items-center gap-3 p-2">
            <SongCover song={s} size={48} radius={8} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-brand text-[17px] italic text-text">{s.title}</span>
              {s.artist && <span className="truncate font-sans text-[13px] text-text-2">{s.artist}</span>}
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void remove(s)}
              className="h-11 flex-none rounded-full bg-[var(--glass-bg)] px-4 font-sans text-[14px] font-medium text-text bl-press-sm disabled:opacity-60"
            >
              {busy === s.titleId ? "Quitando…" : "Quitar"}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onDone} className={`mt-[18px] ${HONEY}`}>
        Listo
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- remove */

export function RemoveSheet({
  party,
  song,
  onParty,
  onStale,
  toast,
}: {
  party: PartyDetail;
  song: PartySong;
  onParty: (p: PartyDetail) => void;
  /** The song (not the party) may be gone: re-read the room. */
  onStale: () => void;
  toast: ToastHost;
}) {
  const dismiss = useSheetDismiss();
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState(false);
  const author = song.addedBy ? `@${song.addedBy.handle}` : "quien la puso";
  const blockable = party.viewer.role === "host" && song.canBlockAuthor;

  const act = async (block: boolean) => {
    setBusy(true);
    const res = block
      ? await logged("remove and block", party.id, removeAndBlockPartyGuestAction(party.id, song.titleId))
      : await logged("remove song", party.id, removePartySongAction(party.id, song.titleId));
    if (res && "ok" in res && res.ok) {
      onParty(res.party);
      dismiss?.();
      toast.show({
        message: block ? `Quitaste ${song.title} y bloqueaste a ${author}.` : `Quitaste ${song.title}.`,
      });
      return;
    }
    setBusy(false);
    fail(res, "No pudimos quitarla. Inténtalo otra vez.", () => {
      dismiss?.();
      onStale();
    });
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3.5">
        <SongCover song={song} size={64} radius={8} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-brand text-[20px] italic text-text">{song.title}</span>
          {song.artist && <span className="truncate font-sans text-[14px] text-text-2">{song.artist}</span>}
          <span className="mt-0.5 flex items-center gap-1.5 font-sans text-[12px] font-medium text-text-3">
            <PersonSeal person={song.addedBy} />
            {creditOf(song, false)}
          </span>
        </span>
      </div>
      <div className="mt-[22px] flex flex-col gap-2">
        {song.canRemove && (
          <button type="button" disabled={busy} onClick={() => void act(false)} className={QUIET_52}>
            Quitar de la colección
          </button>
        )}
        {blockable && (
          <button type="button" disabled={busy} onClick={() => void act(true)} className={QUIET_52}>
            Quitar y bloquear a {author}
          </button>
        )}
        <SheetClose className={CANCEL}>Cancelar</SheetClose>
      </div>
      <p className="mt-2 text-center font-sans text-[12px] leading-[1.4] text-text-3">
        {blockable
          ? `${author[0] === "@" ? author : "Quien la puso"} no recibe aviso. Si lo bloqueas, ya no podrá agregar canciones (sí quitar las suyas).`
          : "La canción sale de la colección para todos."}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- share */

export function ShareSheet({
  party,
  onLink,
  onParty,
  toast,
}: {
  party: PartyDetail;
  onLink: () => void;
  onParty: (p: PartyDetail) => void;
  toast: ToastHost;
}) {
  const fail = usePartyFailure(toast);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const inv = party.invite;
  const url = inv?.active ? inv.url : null;
  const limit = party.perGuestLimit;
  const body =
    limit === 0
      ? "Quien abra el link ve la colección en vivo."
      : `Quien abra el link ve la colección en vivo. Con cuenta en kura, ${
          limit === null ? "pone las canciones que quiera" : `pone hasta ${songsLabel(limit)}`
        }.`;

  const doCopy = async () => {
    if (!url) return;
    if (await copy(url)) setCopied(true);
    else toast.show({ message: "No pudimos copiar el link.", kind: "error" });
  };
  const share = async () => {
    if (!url) return;
    const data = { title: party.name, text: `Pon tus canciones en ${party.name}`, url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    if (await copy(url)) {
      setCopied(true);
      toast.show({ message: "Link copiado." });
    } else {
      toast.show({ message: "No pudimos copiar el link.", kind: "error" });
    }
  };
  const newLink = async () => {
    setBusy(true);
    const res = await logged("rotate link", party.id, rotatePartyInviteAction(party.id));
    setBusy(false);
    if (res && "ok" in res && res.ok) {
      onParty({ ...party, invite: res.invite });
      return;
    }
    fail(res, "No pudimos crear el link. Inténtalo otra vez.");
  };

  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>invita a la fiesta.</h2>
      <p className={BODY}>{body}</p>
      <div className="mt-[18px] flex h-14 items-center justify-between gap-2 rounded-[16px] bg-[var(--glass-bg)] pl-4 pr-2">
        <span className="min-w-0 truncate font-mono text-[14px] font-medium text-text">
          {url ? displayUrl(url) : "Link desactivado"}
        </span>
        {url && (
          <button
            type="button"
            onClick={() => void doCopy()}
            className="h-10 flex-none rounded-full bg-white/[0.12] px-3.5 font-sans text-[13px] font-medium text-text bl-press-sm"
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
      </div>
      {url ? (
        <button type="button" onClick={() => void share()} className={`mt-3 ${HONEY}`}>
          Compartir link
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => void newLink()} className={`mt-3 ${HONEY}`}>
          Crear link nuevo
        </button>
      )}
      <button
        type="button"
        onClick={onLink}
        className="mt-1 flex h-[52px] items-center justify-center rounded-full font-sans text-[15px] font-medium text-text transition-colors active:bg-white/[0.06]"
      >
        Gestionar link
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ link */

export function LinkSheet({
  party,
  lastUrl,
  onParty,
  toast,
}: {
  party: PartyDetail;
  /** The last active URL this screen knew (to say which one stopped opening). */
  lastUrl: string | null;
  onParty: (p: PartyDetail) => void;
  toast: ToastHost;
}) {
  const dismiss = useSheetDismiss();
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState(false);
  const inv = party.invite;
  const active = !!inv?.active;

  const newLink = async () => {
    setBusy(true);
    const res = await logged("rotate link", party.id, rotatePartyInviteAction(party.id));
    setBusy(false);
    if (res && "ok" in res && res.ok) {
      onParty({ ...party, invite: res.invite });
      dismiss?.();
      toast.show({ message: "Link nuevo listo. El anterior ya no funciona." });
      return;
    }
    if (res && "error" in res && res.error === "rate_limited") {
      toast.show({ message: "Ya creaste muchos links en poco tiempo. Espera un rato para crear otro.", kind: "error" });
      return;
    }
    fail(res, "No pudimos crear el link. Inténtalo otra vez.");
  };
  const revoke = async () => {
    setBusy(true);
    const res = await logged("revoke link", party.id, revokePartyInviteAction(party.id));
    setBusy(false);
    if (res && "ok" in res && res.ok) {
      onParty({ ...party, invite: { active: false, token: null, url: null, createdAt: null } });
      return;
    }
    fail(res, "No pudimos desactivar el link. Inténtalo otra vez.");
  };

  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>el link.</h2>
      <div className="mt-4 flex flex-col gap-1 rounded-[18px] bg-[var(--glass-bg)] px-4 py-3.5">
        <span className="flex items-center gap-2 font-sans text-[15px] font-semibold text-text">
          <i
            aria-hidden
            className={`block h-[7px] w-[7px] flex-none rounded-full ${active ? "bg-completed" : "bg-text-3"}`}
          />
          {active ? `Activo${inv?.createdAt ? ` · creado el ${shortDate(inv.createdAt)}` : ""}` : "Desactivado"}
        </span>
        {(active ? inv?.url : lastUrl) && (
          <span className="truncate font-mono text-[12px] font-medium text-text-2">
            {active ? displayUrl(inv!.url!) : `${displayUrl(lastUrl!)} · ya no abre`}
          </span>
        )}
      </div>
      <p className="mt-3 font-sans text-[14px] leading-[1.45] text-text-2 [text-wrap:pretty]">
        {active
          ? "Si creas uno nuevo, el anterior deja de funcionar. Quien ya entró sigue como colaborador."
          : "Nadie más puede entrar con este link. Quien ya entró sigue como colaborador; crea uno nuevo para seguir invitando."}
      </p>
      <div className="mt-[18px] flex flex-col gap-2">
        {active ? (
          <>
            <button type="button" disabled={busy} onClick={() => void newLink()} className={QUIET_52}>
              Crear link nuevo
            </button>
            <button type="button" disabled={busy} onClick={() => void revoke()} className={QUIET_52}>
              Desactivar link
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => void newLink()} className={HONEY}>
            Crear link nuevo
          </button>
        )}
        <SheetClose className={CANCEL}>Cerrar</SheetClose>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ opts */

export function OptionsSheet({
  party,
  go,
}: {
  party: PartyDetail;
  go: (k: "link" | "export" | "edit" | "blocked") => void;
}) {
  const blocked = party.blockedGuests.length;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-2.5">
        <h2 className="min-w-0 truncate font-brand text-[24px] font-normal text-text">{party.name}</h2>
        <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {songsLabel(party.songs.length)}
        </span>
      </div>
      <div className="-mx-2 flex flex-col gap-0.5">
        <MenuRow icon="link" label="Gestionar link" aside={party.invite?.active ? "activo" : "desactivado"} onClick={() => go("link")} />
        <MenuRow icon="music" label="Llevar a otra app" onClick={() => go("export")} />
        <MenuRow icon="pencil" label="Editar" onClick={() => go("edit")} />
        {blocked > 0 && (
          <MenuRow icon="lock" label="Bloqueados" aside={String(blocked)} onClick={() => go("blocked")} />
        )}
      </div>
    </div>
  );
}

/* export: the sheet body lives in party-export.tsx (ExportSheet). */

/* ------------------------------------------------------------------ edit */

export function EditSheet({
  party,
  onSaved,
  onDelete,
  toast,
}: {
  party: PartyDetail;
  onSaved: (p: Pick<PartyDetail, "name" | "perGuestLimit">) => void;
  onDelete: () => void;
  toast: ToastHost;
}) {
  const dismiss = useSheetDismiss();
  const fail = usePartyFailure(toast);
  const [name, setName] = useState(party.name);
  const [limit, setLimit] = useState<number | null>(party.perGuestLimit);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await logged(
      "update party",
      party.id,
      updatePartyAction(party.id, { name: name.trim(), perGuestLimit: limit }),
    );
    setBusy(false);
    if (res && "ok" in res && res.ok) {
      onSaved({ name: name.trim(), perGuestLimit: limit });
      dismiss?.();
      return;
    }
    fail(res, "No pudimos guardar. Inténtalo otra vez.");
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-1.5">
      <SheetTitle>editar fiesta</SheetTitle>
      <span className="mt-1.5 font-sans text-[14px] font-semibold text-text">Nombre</span>
      <input
        required
        maxLength={COLLECTION_NAME_MAX}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Nombre de la fiesta"
        placeholder="la fiesta de…"
        className={SHEET_FIELD}
      />
      <span className="mt-4 font-sans text-[14px] font-semibold text-text">Canciones por invitado</span>
      <LimitStepper value={limit} onChange={setLimit} />
      <p className="px-1 font-sans text-[13px] leading-[1.4] text-text-3">
        Bajar el número no quita canciones: quien ya puso más solo no podrá agregar.
      </p>
      <button type="submit" disabled={busy || !name.trim()} className={`mt-3 ${SHEET_SOLID}`}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={onDelete} className={SHEET_QUIET}>
        Borrar fiesta
      </button>
    </form>
  );
}

export function DeleteSheet({
  party,
  onDeleted,
  toast,
}: {
  party: PartyDetail;
  onDeleted: () => void;
  toast: ToastHost;
}) {
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    const res = await logged("delete party", party.id, deletePartyAction(party.id));
    if (res && "ok" in res && res.ok) {
      onDeleted();
      return;
    }
    setBusy(false);
    fail(res, "No pudimos borrarla. Inténtalo otra vez.");
  };
  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>¿borrar la fiesta?</h2>
      <p className={BODY}>
        Se borra para todos: las {songsLabel(party.songs.length)} y el link. No se puede deshacer.
      </p>
      <div className="mt-[22px] flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={() => void del()} className={QUIET_52}>
          {busy ? "Borrando…" : "Borrar fiesta"}
        </button>
        <SheetClose className={CANCEL}>Cancelar</SheetClose>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- blocked */

export function BlockedSheet({
  party,
  onChanged,
  toast,
}: {
  party: PartyDetail;
  onChanged: () => void;
  toast: ToastHost;
}) {
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState<string | null>(null);
  const unblock = async (ref: string, who: string) => {
    setBusy(ref);
    const res = await logged("unblock guest", party.id, unblockPartyGuestAction(party.id, ref));
    setBusy(null);
    if (res && "ok" in res && res.ok) {
      toast.show({ message: `Desbloqueaste a ${who}.` });
      onChanged();
      return;
    }
    // not_found here = that ref is stale (already unblocked elsewhere): re-read.
    fail(res, "No pudimos desbloquear. Inténtalo otra vez.", onChanged);
  };
  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>bloqueados.</h2>
      <p className={BODY}>Siguen viendo la fiesta, pero ya no pueden agregar canciones (sí quitar las suyas).</p>
      <ul className="-mx-2 mt-[18px] flex flex-col gap-0.5">
        {party.blockedGuests.map((g) => (
          <li key={g.guestRef} className="flex items-center gap-3 p-2">
            <PersonSeal person={g.person} size={36} />
            <span className="min-w-0 flex-1 truncate font-sans text-[15px] font-medium text-text">
              {handleOf(g.person)}
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void unblock(g.guestRef, handleOf(g.person))}
              className="h-11 flex-none rounded-full bg-[var(--glass-bg)] px-4 font-sans text-[14px] font-medium text-text bl-press-sm disabled:opacity-60"
            >
              {busy === g.guestRef ? "Desbloqueando…" : "Desbloquear"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------- guest options */

/** A guest's "…": "Llevar a otra app" and "Salir de la fiesta" (C3). */
export function GuestOptionsSheet({
  party,
  onExport,
  onLeave,
}: {
  party: PartyDetail;
  /** Guests export too (D2 of the export contract). */
  onExport: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-2.5">
        <h2 className="min-w-0 truncate font-brand text-[24px] font-normal text-text">{party.name}</h2>
        <span className="flex-none font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          {songsLabel(party.songs.length)}
        </span>
      </div>
      <div className="-mx-2 flex flex-col gap-0.5">
        <MenuRow icon="music" label="Llevar a otra app" onClick={onExport} />
        <MenuRow icon="arrow" label="Salir de la fiesta" onClick={onLeave} />
      </div>
    </div>
  );
}

/** "¿salir de la fiesta?" — the confirmation; then /backlogs with a toast. */
export function LeaveSheet({
  party,
  onLeft,
  toast,
}: {
  party: PartyDetail;
  onLeft: () => void;
  toast: ToastHost;
}) {
  const fail = usePartyFailure(toast);
  const [busy, setBusy] = useState(false);
  const mine = party.songs.filter((s) => s.mine).length;
  const leave = async () => {
    setBusy(true);
    const res = await logged("leave party", party.id, leavePartyAction(party.id));
    if (res && "ok" in res && res.ok) {
      onLeft();
      return;
    }
    setBusy(false);
    fail(res, "No pudimos sacarte de la fiesta. Inténtalo otra vez.");
  };
  return (
    <div className="flex flex-col">
      <h2 className={BIG_TITLE}>¿salir de la fiesta?</h2>
      <p className={BODY}>
        {mine > 0
          ? `La fiesta sale de tus colecciones. ${mine === 1 ? "Tu canción se queda" : `Tus ${songsLabel(mine)} se quedan`} en la colección.`
          : "La fiesta sale de tus colecciones."}{" "}
        Si el link sigue activo, puedes volver a entrar.
      </p>
      <div className="mt-[22px] flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={() => void leave()} className={QUIET_52}>
          {busy ? "Saliendo…" : "Salir de la fiesta"}
        </button>
        <SheetClose className={CANCEL}>Cancelar</SheetClose>
      </div>
    </div>
  );
}
