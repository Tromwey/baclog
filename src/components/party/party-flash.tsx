"use client";

import { useEffect } from "react";
import { Toast, useToast } from "@/components/kura/toast";

/**
 * A one-shot toast that survives a navigation: the party page writes it
 * right before sending the person to /backlogs ("Saliste de la fiesta.",
 * "Esa fiesta ya no está disponible."), and /backlogs shows it once.
 * sessionStorage, so it never outlives the tab; unavailable storage = the
 * navigation still happens, just without the sentence.
 */

const KEY = "kura:party-flash";

export function setPartyFlash(message: string) {
  try {
    window.sessionStorage.setItem(KEY, message);
  } catch {
    // private mode: no toast after the redirect
  }
}

export function PartyFlash() {
  const toast = useToast();
  useEffect(() => {
    let message: string | null = null;
    try {
      message = window.sessionStorage.getItem(KEY);
      if (message) window.sessionStorage.removeItem(KEY);
    } catch {
      message = null;
    }
    if (message) toast.show({ message });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  return <Toast host={toast} bottom="calc(var(--dock-clearance) - 22px)" />;
}
