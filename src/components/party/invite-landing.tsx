"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { joinPartyAction } from "@/app/actions/party-collection-actions";
import { EnterPill, Wordmark } from "@/components/kura/components";
import { feedSurface, feedTail, tintEnds } from "@/components/kura/tint";
import { Toast, useToast } from "@/components/kura/toast";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { loginPathFor } from "@/lib/return-to";
import { invitePath } from "@/modules/party-collections/rules";
import type { InvitePreview } from "@/modules/party-collections/types";
import { logged } from "./party-errors";
import { DeadLinkScreen } from "./dead-link";
import { handleOf, PartyHero, songsLabel, SongRowBody, yourSongs } from "./party-parts";
import { BRIDGE_QUERY, PARTY_TOKENS } from "./party-tokens";
import { usePartyHexes } from "./use-party-tint";

/**
 * /f/{token} — the visitor's landing (fiesta-app-v2 · landing / loading /
 * empty / bridge). The party live: hero fan, name, who's in, "las canciones"
 * with who put each, tinted by the first song's palette, and ONE honey action
 * at the bottom.
 *
 * Entering (contract §3):
 *  - signed out → the CTA (and "Entrar") go to `/login?to=/f/{token}`; the
 *    CTA also leaves a per-token note in sessionStorage so that, back here
 *    signed in, the join runs by itself — the person already said "entra";
 *  - signed in → `joinPartyAction`: `ok` → the member page (`?w=` asks it
 *    for the welcome sheet), `onboarding_required` → `/onboarding?to=…`
 *    (noting that this person is NEW, so the sheet says "ya estás dentro."
 *    rather than the returning "ya estás dentro, @user."), `invalid_link` →
 *    the dead-link screen.
 */

const JOIN_NOTE = (token: string) => `kura:party-join:${token}`;
const NEW_NOTE = (token: string) => `kura:party-new:${token}`;

function note(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // private mode: the join just waits for a tap
  }
}
function readNote(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function InviteLanding({
  preview,
  signedIn,
  fromParty,
}: {
  preview: InvitePreview;
  signedIn: boolean;
  /** Arrived from /party's "Abrir la playlist": play the bridge in. */
  fromParty: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { party, token } = preview;
  const hexes = usePartyHexes(party.songs);
  const [dead, setDead] = useState(false);
  const [joining, setJoining] = useState(false);

  const join = useCallback(async () => {
    setJoining(true);
    const res = await logged("join", preview.party.id, joinPartyAction(token));
    if (res && "ok" in res && res.ok) {
      note(JOIN_NOTE(token), null);
      const wasNew = readNote(NEW_NOTE(token));
      note(NEW_NOTE(token), null);
      const w = res.joined === "host" ? null : res.joined === "new" && wasNew ? "new" : "back";
      router.replace(w ? `${res.path}?w=${w}` : res.path);
      return;
    }
    if (res && "error" in res) {
      if (res.error === "signin_required") {
        router.push(res.loginPath);
        return;
      }
      if (res.error === "onboarding_required") {
        note(NEW_NOTE(token), "1");
        // Hard navigation: the onboarding is another tree with its own guards.
        window.location.assign(res.onboardingPath);
        return;
      }
      if (res.error === "invalid_link") {
        note(JOIN_NOTE(token), null);
        setDead(true);
        return;
      }
    }
    setJoining(false);
    // Every refusal `joinPartyAction` can answer returned above: what is left
    // is a thrown/failed call (`logged` already wrote it down).
    toast.show({ message: "No se pudo entrar a la fiesta. Vuelve a intentarlo.", kind: "error" });
  }, [router, toast, token, preview.party.id]);

  // Back from /login (or the onboarding) with a session: finish what the CTA started.
  const auto = useRef(false);
  useEffect(() => {
    if (!signedIn || auto.current || !readNote(JOIN_NOTE(token))) return;
    auto.current = true;
    void join();
  }, [signedIn, token, join]);

  const enter = () => {
    note(JOIN_NOTE(token), "1");
    if (!signedIn) {
      router.push(loginPathFor(invitePath(token)));
      return;
    }
    void join();
  };

  const bridge = useBridgeIn(fromParty);

  if (dead) return <DeadLinkScreen />;

  const n = party.songs.length;
  const limit = party.perGuestLimit;
  const tail = feedTail(hexes);
  const cta = signedIn
    ? "Entrar a la fiesta"
    : limit === 0
      ? "Entra a kura para ver la colección"
      : `Entra a kura para agregar ${yourSongs(limit)}`;

  return (
    <main
      className="relative mx-auto min-h-dvh w-full max-w-md pb-[170px] text-text"
      style={{ background: feedSurface(hexes), backgroundColor: tail }}
    >
      <ThemeColorSync color={hexes.length ? tintEnds(hexes)[0] : undefined} exact />
      <header className="flex h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)] mt-1">
        <Wordmark variant="C" />
        {!signedIn && <EnterPill href={loginPathFor(invitePath(token))} />}
      </header>

      <PartyHero
        name={party.name}
        songs={party.songs}
        perGuestLimit={limit}
        contributors={party.contributors}
        who={`de ${handleOf(party.host)} · ${songsLabel(n)}`}
        fanSlot={(fan) => (
          <div ref={bridge.heroRef} style={bridge.heroStyle} className="flex justify-center">
            {fan}
          </div>
        )}
      />

      {n > 0 ? (
        <section aria-label="Las canciones">
          <div className="flex items-baseline justify-between px-5 pb-3.5">
            <h2 className="font-brand text-[22px] font-normal">las canciones</h2>
          </div>
          <ul className="flex flex-col gap-0.5 px-2">
            {party.songs.map((s) => (
              <li key={s.titleId} className="flex items-center gap-3 rounded-[18px] px-3 py-2">
                <SongRowBody song={s} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col items-center gap-2.5 px-8 text-center">
          <span className="font-brand text-[28px] leading-[1.1]">la pista está vacía</span>
          <span className="max-w-[28ch] font-sans text-[15px] leading-[1.5] text-text-2 [text-wrap:pretty]">
            Nadie ha agregado canciones todavía. Alguien tiene que abrir la pista.
          </span>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pb-[calc(30px+env(safe-area-inset-bottom))] pt-14"
        style={{ background: `linear-gradient(transparent, ${tail} 42%)` }}
      >
        <button
          type="button"
          onClick={enter}
          disabled={joining}
          className="h-14 w-full rounded-full bg-honey px-5 font-sans text-[16px] font-semibold text-bg bl-press active:bg-honey-press disabled:opacity-60"
        >
          {joining ? "Entrando…" : cta}
        </button>
        {!signedIn && (
          <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
            Con tu correo · 1 minuto
          </span>
        )}
      </div>

      <Toast host={toast} bottom={130} />
      {bridge.overlay}
    </main>
  );
}

/* ------------------------------------------------------------ the bridge */

/**
 * /party → /f/{token} (fiesta-app-v2 · bridge): the page opens under the
 * party's own ink with "Te llevamos a la playlist…", and the hero fan flies
 * from where /party's card had it (low, small) into the hero while the ink
 * fades. Reduced motion: the ink simply fades. The `?from=party` is dropped
 * from the URL once played (a reload doesn't replay it).
 */
function useBridgeIn(active: boolean) {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"start" | "go" | "done">(active ? "start" : "done");
  const [from, setFrom] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const el = heroRef.current;
    if (el && !reduced) {
      const r = el.getBoundingClientRect();
      const sc = 0.56;
      const sx = (window.innerWidth - r.width * sc) / 2;
      const sy = window.innerHeight * 0.55;
      setFrom(`translate(${sx - r.left}px, ${sy - r.top}px) scale(${sc})`);
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(BRIDGE_QUERY);
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    } catch {
      // cosmetic
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("go"));
    });
    const done = setTimeout(() => setPhase("done"), 1700);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [active, reduced]);

  const go = phase !== "start";
  const flying = phase !== "done";
  const heroStyle: CSSProperties | undefined = flying
    ? {
        position: "relative",
        zIndex: 41,
        transformOrigin: "0 0",
        transform: go || !from ? "none" : from,
        // The server frame can't know where the flight starts: hide the fan
        // until it's measured (it's under the ink until then anyway).
        opacity: go || from ? 1 : 0,
        transition: go ? "transform 1000ms cubic-bezier(.2,.85,.25,1)" : "none",
      }
    : undefined;

  const overlay = flying ? (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40" style={PARTY_TOKENS}>
      <div
        className="absolute inset-0"
        style={{
          background: "var(--p-bg)",
          opacity: go ? 0 : 1,
          transition: go ? "opacity 650ms 380ms ease" : "none",
        }}
      />
      <div
        className="absolute inset-x-0 top-[43%] text-center font-brand text-[20px]"
        style={{
          color: "var(--p-bone)",
          opacity: go ? 0 : 1,
          transform: go ? "translateY(-8px)" : "none",
          transition: go ? "opacity 280ms, transform 280ms" : "none",
        }}
      >
        Te llevamos a la playlist…
      </div>
    </div>
  ) : null;

  return { heroRef, heroStyle, overlay };
}
