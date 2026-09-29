import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/auth";
import { DeadLinkScreen } from "@/components/party/dead-link";
import { InviteLanding } from "@/components/party/invite-landing";
import { perGuestPhrase } from "@/components/party/party-parts";
import { PartySoonScreen } from "@/components/party/party-soon";
import { MIGRATION_0033_LIVE } from "@/modules/party-collections/live";
import { getInvitePreview } from "@/modules/party-collections/queries";
import { parseInviteToken, partyPath } from "@/modules/party-collections/rules";

/**
 * /f/{token} — the invite landing (fiesta-app-v2 · landing; contract §2–§3).
 * Anyone holding an ACTIVE link sees the party live, signed in or not.
 *
 *  - Migration 0033 not live yet → "las fiestas llegan muy pronto." for EVERY
 *    token (contract C1 — checked before the token is looked at, so it
 *    confirms nothing; a good link must not read as dead).
 *  - Malformed / unknown / revoked token or a block with the host →
 *    `getInvitePreview` is null → "este link ya no funciona." (one screen for
 *    all of them: no oracle).
 *  - Already a member (or the host) → straight to the member page.
 *  - Otherwise the landing; its CTA signs in (`/login?to=/f/{token}`) and/or
 *    joins (`joinPartyAction`) — see invite-landing.tsx.
 *
 * Outside `(app)`: no dock, no onboarding gate (a visitor has no account).
 *
 * `referrer: "no-referrer"` (security B4): the token in this URL is the
 * party's key — nothing this page loads or links to (covers on mzstatic,
 * "Conocer kura", the login) may receive it in a `Referer` header.
 */

const preview = cache((token: string, viewerId: string | null) => getInvitePreview(token, viewerId));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const p = MIGRATION_0033_LIVE && parseInviteToken(token) ? await preview(token, null) : null;
  return {
    title: p ? `${p.party.name} · kura` : "kura",
    description: p ? `Colección de fiesta: ${perGuestPhrase(p.party.perGuestLimit)}.` : undefined,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, sp, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (!MIGRATION_0033_LIVE) return <PartySoonScreen />;
  if (!parseInviteToken(token)) return <DeadLinkScreen />;

  const p = await preview(token, user?.id ?? null);
  if (!p) return <DeadLinkScreen />;
  if (p.viewer?.joined) redirect(partyPath(p.party.id));

  return (
    <InviteLanding
      preview={p}
      signedIn={!!user}
      fromParty={sp.from === "party"}
    />
  );
}
