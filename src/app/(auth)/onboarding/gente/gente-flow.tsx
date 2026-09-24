"use client";

import { useState } from "react";
import {
  followUserAction,
  unfollowUserAction,
} from "@/app/actions/social-actions";
import { Cover, Glyph, Seal } from "@/components/kura/components";
import { tintSurfaceVertical } from "@/components/kura/tint";
import {
  FailLine,
  FlowCta,
  PinnedFooter,
  SEED_STEPS,
  StepMark,
} from "../chrome";
import type { OnboardingPerson, OwnPick } from "@/modules/social/people";
import { ServiceStep } from "../service-step";

/**
 * 32b "gente con tus obsesiones." → the service step. Client state, one
 * page: the follows made here carry into the last CTA ("Entrar a kura ·
 * sigues a N" — the mock's line, moved to where the flow actually ends).
 *
 * The list is copied into state ONCE: a follow revalidates and re-renders the
 * server page, and a list that re-sorted or re-queried under the user's thumb
 * would move the row they just tapped.
 */
export function GenteFlow({
  picks,
  people: initialPeople,
}: {
  picks: OwnPick[];
  people: OnboardingPerson[];
}) {
  const [people] = useState(initialPeople);
  const [following, setFollowing] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialPeople.map((p) => [p.username, p.following])),
  );
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [step, setStep] = useState<"gente" | "servicio">("gente");

  const followCount = Object.values(following).filter(Boolean).length;

  // Optimistic: the pill flips on tap and only reverts if the server says no
  // (or the action rejects — expired session, network drop).
  async function toggle(username: string) {
    const next = !following[username];
    setFailedFor(null);
    setFollowing((f) => ({ ...f, [username]: next }));
    try {
      const res = next
        ? await followUserAction(username)
        : await unfollowUserAction(username);
      if ("error" in res) throw new Error(res.error);
    } catch {
      setFollowing((f) => ({ ...f, [username]: !next }));
      setFailedFor(username);
    }
  }

  if (step === "servicio") {
    return (
      <ServiceStep followCount={followCount} onBack={() => setStep("gente")} />
    );
  }

  return (
    <main className="relative isolate h-dvh overflow-hidden bg-bg text-text">
      <div className="bl-scroll h-full overflow-y-auto overscroll-contain">
        <div
          style={{
            background: tintSurfaceVertical(picks[0]?.paletteHex ?? []),
          }}
        >
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-7 pt-[calc(72px+env(safe-area-inset-top))]">
            <StepMark n={2} of={SEED_STEPS} />
            {picks.length > 0 && (
              <div className="flex items-end justify-center gap-2.5 pb-1 pt-2">
                {picks.map((p, i) => (
                  <Cover
                    key={p.catalogItemId}
                    posterUrl={p.posterUrl}
                    paletteHex={p.paletteHex}
                    mediaType={p.mediaType}
                    alt={p.title}
                    className="bl-rise"
                    style={{ height: 120, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
            )}
            <h1 className="font-brand text-[32px] font-normal leading-[1.08] text-text text-balance">
              gente con tus obsesiones.
            </h1>
            <p className="text-[15px] leading-[1.5] text-text-2 text-pretty">
              {people.length > 0
                ? "Síguela para llenar tu feed. Puedes hacerlo después."
                : "Aún no hay nadie con tus tres. Cuando quieras, la buscas desde el feed."}
            </p>
          </div>
        </div>

        {people.length > 0 && (
          <ul className="mx-auto flex w-full max-w-md flex-col px-5 pb-[calc(150px+env(safe-area-inset-bottom))] pt-2">
            {people.map((p) => {
              const on = following[p.username] ?? false;
              return (
                <li key={p.username} className="flex min-h-[72px] flex-col justify-center">
                  <div className="flex items-center gap-3.5">
                    <Seal
                      name={p.name || p.username}
                      hexes={p.avatarHexes}
                      src={p.avatarUrl}
                      size={44}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[16px] font-semibold text-text">
                        @{p.username}
                      </span>
                      {p.sharedTitle ? (
                        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-text-2">
                          <Glyph kind="obsessed" size={12} />
                          <span className="truncate">
                            También le obsesiona {p.sharedTitle}
                          </span>
                        </span>
                      ) : p.name && p.name !== p.username ? (
                        <span className="truncate text-[13px] text-text-2">
                          {p.name}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Seguir a @${p.username}`}
                      onClick={() => void toggle(p.username)}
                      className={`inline-flex h-9 flex-none items-center rounded-full px-3.5 font-sans text-[14px] font-semibold bl-press ${
                        on
                          ? "bg-transparent text-text-2 hover:text-text"
                          : "bg-[var(--glass-bg)] text-text hover:bg-white/[0.12]"
                      }`}
                    >
                      {on ? "Siguiendo" : "Seguir"}
                    </button>
                  </div>
                  {failedFor === p.username && (
                    <FailLine align="start" className="pb-2 pl-[58px]">
                      No se guardó. Toca de nuevo.
                    </FailLine>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PinnedFooter>
        <FlowCta ready onClick={() => setStep("servicio")}>
          {followCount > 0 ? `Continuar · sigues a ${followCount}` : "Continuar"}
        </FlowCta>
      </PinnedFooter>
    </main>
  );
}
