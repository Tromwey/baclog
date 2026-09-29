import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/auth";
import { PartyRoom } from "@/components/party/party-room";
import { PartySoonScreen } from "@/components/party/party-soon";
import { loginPathFor, safeReturnTo } from "@/lib/return-to";
import { PartyUnavailableError } from "@/modules/party-collections/errors";
import { MIGRATION_0033_LIVE } from "@/modules/party-collections/live";
import { getPartyDetail } from "@/modules/party-collections/queries";
import { partyPath } from "@/modules/party-collections/rules";

/**
 * /c/{id} — a party's member page (contract §2): host + members only; anyone
 * else, an unknown id or a non-UUID → the same 404 (no oracle). Migration
 * 0033 not live yet → "las fiestas llegan muy pronto." for every id (C1),
 * after the session check (it says nothing about the id).
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
 * read (party-room.tsx).
 */

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
  if (!user.name) {
    const to = safeReturnTo(path);
    redirect(to ? `/onboarding?to=${encodeURIComponent(to)}` : "/onboarding");
  }
  if (!MIGRATION_0033_LIVE) return <PartySoonScreen />;
  if (!UUID_RE.test(backlogId)) notFound();

  let party;
  try {
    party = await getPartyDetail(user.id, backlogId);
  } catch (err) {
    if (err instanceof PartyUnavailableError) return <PartySoonScreen />;
    throw err;
  }
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
    />
  );
}
