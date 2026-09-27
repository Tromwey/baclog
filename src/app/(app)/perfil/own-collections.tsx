"use client";

import Link from "next/link";
import { useState } from "react";
import { CollectionsShowcase } from "@/components/kura/collections-showcase";
import { Fan } from "@/components/kura/fan";
import type { ShelfSummary } from "@/modules/backlog/shelves";
import { visibilityOf } from "@/modules/backlog/visibility";
import { CollectionHoldSheet } from "../backlogs/collection-hold-sheet";

/**
 * "tus colecciones" on your own profile (3b) — the showcase plus 9a: holding
 * any fan opens the collection's hold sheet (Agregar · Compartir · Fijar ·
 * Renombrar · Privacidad · Borrar colección), the same one Tus colecciones
 * opens. A tap still opens the collection.
 */
export function OwnCollections({
  shelves,
  username,
  profilePublic,
}: {
  shelves: ShelfSummary[];
  username: string | null;
  profilePublic: boolean;
}) {
  const [holdId, setHoldId] = useState<string | null>(null);
  const holding = shelves.find((s) => s.id === holdId) ?? null;

  return (
    <>
      <CollectionsShowcase
        title="tus colecciones"
        seeAllHref="/backlogs"
        onHold={setHoldId}
        flight
        collections={shelves.map((b) => ({
          id: b.id,
          name: b.name,
          vibe: b.vibe,
          count: b.itemCount,
          pinned: b.pinned,
          fan: b.fan,
          href: `/backlogs/${b.id}`,
        }))}
        empty={
          <Link href="/backlogs" aria-label="Tu primera colección" className="flex justify-center bl-press-lg">
            <Fan covers={[]} lead={186} ghost />
          </Link>
        }
      />
      {holding && (
        <CollectionHoldSheet
          collection={{
            id: holding.id,
            name: holding.name,
            vibe: holding.vibe,
            count: holding.itemCount,
            pinned: holding.pinned,
            visibility: visibilityOf(holding),
          }}
          username={username}
          profilePublic={profilePublic}
          onClose={() => setHoldId(null)}
        />
      )}
    </>
  );
}
