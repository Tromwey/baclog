"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { LoadMoreButton } from "@/components/ui";
import { FollowButton } from "@/components/follow-button";
import { loadMorePeopleAction } from "@/app/actions/social-actions";
import { plural } from "@/lib/plural";
import type { PersonRow } from "@/modules/social/types";

/**
 * F3.10 (design 1i) — the rows of "A quién sigues" / "Quién te sigue". Only
 * ever rendered for their owner (lists are private; counts are the public
 * part). A follow whose target went private stays listed, dimmed, WITH its
 * chip — a deliberate deviation from the mock's "Sin actividad" label, because
 * hiding the button would make that follow unremovable.
 */
export function PeopleList({
  mode,
  initialPeople,
  initialCursor,
  privateCount,
}: {
  mode: "following" | "followers";
  initialPeople: PersonRow[];
  initialCursor: string | null;
  privateCount: number;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      const page = await loadMorePeopleAction({ mode, cursor });
      setPeople((prev) => [...prev, ...page.people]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="mt-3.5 flex flex-col gap-2">
      {people.map((p) => (
        <PersonRowView key={p.username} p={p} />
      ))}

      {privateCount > 0 && (
        <div className="py-2 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
          +{privateCount}{" "}
          {plural(privateCount, "cuenta privada", "cuentas privadas")}
        </div>
      )}

      {cursor && (
        <LoadMoreButton onClick={loadMore} loading={loading} className="mt-0.5" />
      )}
    </div>
  );
}

/**
 * One person row — identity (orb, name, @handle · meta) plus the follow chip.
 * Shared with Buscar gente (/feed/gente), so a search result and a list row
 * are the same object; a private row (only possible in the owner's lists)
 * dims and loses its link, since a private profile has no page to land on.
 */
export function PersonRowView({ p }: { p: PersonRow }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[14px] bg-surface-1 py-[11px] pl-3.5 pr-3 ${
        p.isPrivate ? "opacity-55" : ""
      }`}
    >
      {p.isPrivate ? (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <PersonIdentity p={p} />
        </span>
      ) : (
        <Link
          href={`/u/${p.username}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <PersonIdentity p={p} />
        </Link>
      )}
      <FollowButton
        username={p.username}
        initialFollowing={p.following}
        size="sm"
      />
    </div>
  );
}

function PersonIdentity({ p }: { p: PersonRow }) {
  return (
    <>
      <AdnAvatar hexes={p.avatarHexes} className="h-10 w-10" />
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-semibold text-text">
          {p.name}
        </span>
        <span className="mt-[3px] block truncate font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
          @{p.username} ·{" "}
          {p.isPrivate
            ? "perfil privado"
            : p.isFounder
              ? "fundador"
              : `${p.backlogCount} ${plural(p.backlogCount, "backlog", "backlogs")}`}
        </span>
      </span>
    </>
  );
}
