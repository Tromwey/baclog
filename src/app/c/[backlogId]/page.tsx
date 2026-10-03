import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";
import { isOnboarded } from "@/auth/user-row";
import { parseTidalReturn } from "@/components/party/export-copy";
import { PartyRoom } from "@/components/party/party-room";
import { loginPathFor, safeReturnTo } from "@/lib/return-to";
import { getPartyDetail } from "@/modules/party-collections/queries";
import { partyPath } from "@/modules/party-collections/rules";

/**
 * /c/{id} — a party's member page (contract §2): host + members only; anyone
 * else, an unknown id or a non-UUID → the same 404 (no oracle).
 *
 * Lives OUTSIDE `(app)` on purpose (desviación registrada en
 * state/frontend.md): the `(app)` layout's `requireUser()` sends a signed-out
 * visitor to a bare `/login`, and the contract wants `/login?to=/c/{id}`; and
 * this screen has its own bottom bar where the dock would sit (the design
 * draws no dock here). The onboarding gate `(app)` gives is repeated below.
 *
 * `?w=new|back` (from the join) opens the welcome sheet; `?sheet=share`
 * (from "Crear fiesta") opens "invita a la fiesta."; `?sheet=search` (the
 * Buscar chip of Tus colecciones) opens the search. All leave the URL once
 * read (party-room.tsx). `?music=tidal&connected=1|0[&reason=]` is the
 * landing of the TIDAL OAuth callback (export contract §4.1): 1 reopens the
 * export, 0 says why in a toast.
 */

/**
 * This page hosts the TIDAL export's server action (`stepTidalExportAction`,
 * called from party-export.tsx): a server action runs under the `maxDuration`
 * of the page it is called from. Same number as the v1 step route and no
 * longer than the step's lease (`LEASE_MS`, modules/music-export/exports.ts)
 * — `check-music-export` keeps the three together.
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "fiesta · kura",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PartyPage({
  params,
  searchParams,
}: {
  params: Promise<{ backlogId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ backlogId }, sp, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const path = partyPath(backlogId);
  if (!user) redirect(loginPathFor(path));
  if (!isOnboarded(user)) {
    const to = safeReturnTo(path);
    redirect(to ? `/onboarding?to=${encodeURIComponent(to)}` : "/onboarding");
  }
  if (!UUID_RE.test(backlogId)) notFound();

  const party = await getPartyDetail(user.id, backlogId);
  if (!party) notFound();

  const w = sp.w === "new" || sp.w === "back" ? sp.w : null;
  return (
    <PartyRoom
      key={party.id}
      initial={party}
      viewerHandle={user.username}
      welcome={w}
      openShare={sp.sheet === "share"}
      openSearch={sp.sheet === "search"}
      tidalReturn={parseTidalReturn(sp)}
    />
  );
}
