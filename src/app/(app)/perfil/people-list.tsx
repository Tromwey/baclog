"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AdnAvatar } from "@/components/adn-avatar";
import { GLASS_BUTTON } from "@/components/kura/components";
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
    <div className="flex flex-col">
      {people.map((p) => (
        <PersonRowView key={p.username} p={p} />
      ))}

      {privateCount > 0 && (
        <div className="py-3 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-2">
          +{privateCount}{" "}
          {plural(privateCount, "cuenta privada", "cuentas privadas")}
        </div>
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className={`${GLASS_BUTTON} mt-3 self-center disabled:opacity-60`}
        >
          {loading ? "Cargando…" : "Ver más"}
        </button>
      )}
    </div>
  );
}

/**
 * One person row (20e / 32b) — seal 44, @usuario 16/600, a 13 line of
 * context, and the glass follow pill; 72 tall, no surface (separation by
 * air, not by fill). Shared with Tu gente (/feed/gente), so a search result
 * and a list row are the same object. A private row (only possible in the
 * owner's lists) dims and loses its link — a private profile has no page to
 * land on — but KEEPS its pill, or that follow would be unremovable.
 */
export function PersonRowView({ p }: { p: PersonRow }) {
  return (
    <div
      className={`flex min-h-[72px] items-center gap-3.5 transition-colors has-[a:active]:opacity-70 ${
        p.isPrivate ? "opacity-55" : ""
      }`}
    >
      {p.isPrivate ? (
        <span className="flex min-w-0 flex-1 items-center gap-3.5">
          <PersonIdentity p={p} />
        </span>
      ) : (
        <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3.5">
          <PersonIdentity p={p} />
        </Link>
      )}
      <FollowButton username={p.username} initialFollowing={p.following} variant="row" />
    </div>
  );
}

function PersonIdentity({ p }: { p: PersonRow }) {
  const meta = p.isPrivate
    ? "perfil privado"
    : [
        p.name && p.name !== p.username ? p.name : null,
        p.isFounder ? "fundador" : null,
        `${p.backlogCount} ${plural(p.backlogCount, "colección", "colecciones")}`,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <>
      <AdnAvatar hexes={p.avatarHexes} name={p.name || p.username} src={p.avatarUrl} className="h-11 w-11" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[16px] font-semibold text-text">@{p.username}</span>
        <span className="truncate text-[13px] text-text-2">{meta}</span>
      </span>
    </>
  );
}
