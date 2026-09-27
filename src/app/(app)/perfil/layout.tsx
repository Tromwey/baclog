import type { ReactNode } from "react";

/**
 * Hosts the @modal parallel slot next to the profile. {modal} is null
 * (default.tsx / page.tsx / [...catchAll]) except when a soft navigation FROM
 * the profile to /backlogs/[backlogId] is intercepted into the collection
 * overlay (`@modal/(..)backlogs/[backlogId]`): the profile stays mounted
 * underneath, so its fan can fly into the collection's header and back
 * (Colecciones · transiciones §2/§3). A hard nav / refresh of that URL — or
 * a soft nav from anywhere else — renders the full page instead.
 *
 * `data-collection-underlay` is how the overlay finds the profile to push it
 * back 4 % while the collection opens.
 */
export default function PerfilLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      <div data-collection-underlay>{children}</div>
      {modal}
    </>
  );
}
