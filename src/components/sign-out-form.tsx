"use client";

import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/account-actions";
import { clearRecents } from "@/app/(app)/descubrir/recents";

/**
 * "Cerrar sesión", everywhere it is offered. The action ends the session on
 * the server; what lives only in THIS browser (Descubrir's recent searches
 * and "vistos hace poco") the server can't reach, so the form clears it on
 * the way out — the next person to sign in on this device starts clean.
 */
export function SignOutForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form action={signOutAction} onSubmit={() => clearRecents()} className={className}>
      {children}
    </form>
  );
}
