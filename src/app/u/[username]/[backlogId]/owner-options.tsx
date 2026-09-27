"use client";

import { useState } from "react";
import { CollectionHoldSheet, type HoldCollection } from "@/app/(app)/backlogs/collection-hold-sheet";
import { DotsIcon } from "@/components/kura/icons";
import { glassChipClass } from "@/components/ui";

/**
 * 9c — your public link, seen as its owner: a glass Opciones next to
 * Compartir that opens 9a, the same sheet as holding the fan in Tus
 * colecciones. Only rendered for the owner (the page re-checks ownership
 * with assertOwnsBacklog); every write re-checks it again server-side.
 */
export function OwnerOptions({
  collection,
  username,
  profilePublic,
}: {
  collection: HoldCollection;
  username: string | null;
  profilePublic: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Opciones de ${collection.name}`}
        onClick={() => setOpen(true)}
        className={`${glassChipClass} h-11! w-11!`}
      >
        <DotsIcon />
      </button>
      {open && (
        <CollectionHoldSheet
          collection={collection}
          username={username}
          profilePublic={profilePublic}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

