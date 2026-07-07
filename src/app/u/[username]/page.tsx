import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getPublicProfile } from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import { AuraBackdrop, Button, MonoMeta, StatusChip } from "@/components/ui";
import { ReportButton } from "./report-button";

// Dynamic (not ISR) on purpose: F3.4 captures viewer geo/device server-side
// via headers() for a reliable, ad-blocker-proof ADR-000 signal. At M3 scale
// the lost ISR caching is negligible; revisit with a beacon if load grows.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username);
  if (!profile) return {};
  // OG image = the first backlog's first cover, so the primary share
  // destination previews with an image (consistent with backlog/page.tsx).
  const firstPoster = profile.backlogs
    .flatMap((b) => b.coverUrls)
    .find(Boolean);
  return {
    title: `${profile.displayName} · Baclog`,
    description: `Los backlogs de ${profile.displayName} — películas, series y música.`,
    openGraph: {
      title: `${profile.displayName} en Baclog`,
      description: `${profile.backlogs.length} backlogs de obsesiones.`,
      type: "profile",
      ...(firstPoster ? { images: [firstPoster] } : {}),
    },
  };
}

/** Overlapping polaroid-tilt for the first three real backlogs (§6). */
const TILT = [
  "-rotate-6 -translate-x-1 z-10",
  "rotate-3 translate-x-2 -translate-y-3 z-20",
  "rotate-[11deg] translate-x-1 translate-y-2 z-10",
];

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  // Private and nonexistent are identical 404s — no enumeration oracle
  if (!profile) notFound();

  captureView({
    eventType: "public_profile_view",
    targetUsername: profile.username,
    headers: await headers(),
  });

  const totalItems = profile.backlogs.reduce((n, b) => n + b.itemCount, 0);
  const stack = profile.backlogs.filter((b) => b.itemCount > 0).slice(0, 3);

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      <AuraBackdrop height="340px" />

      <main className="relative px-5 pb-32 pt-9">
        <header className="bl-rise">
          <MonoMeta className="text-text-2">baclog.app/{profile.username}</MonoMeta>
          <h1 className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-[-0.02em]">
            {profile.displayName}
          </h1>
          {profile.isFounder && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-accent">
              <Sparkles size={12} /> Fundador
            </span>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusChip tone="completed" glass>
              {profile.backlogs.length}{" "}
              {profile.backlogs.length === 1 ? "backlog" : "backlogs"}
            </StatusChip>
            <StatusChip tone="obsessing" glass>
              {totalItems} obsesiones
            </StatusChip>
          </div>
        </header>

        {/* Tilted stack of real backlog covers — "yo también puedo hacer estas" */}
        {stack.length > 0 && (
          <div className="relative mt-9 flex h-56 items-center justify-center">
            {stack.map((b, i) => (
              <Link
                key={b.id}
                href={`/u/${profile.username}/${b.id}`}
                className={`absolute h-44 w-32 overflow-hidden rounded-[var(--r-md)] border border-line bg-surface-1 shadow-[var(--shadow-card)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] hover:!rotate-0 hover:!translate-x-0 hover:!translate-y-0 ${TILT[i]}`}
              >
                <div className="grid h-28 grid-cols-2 gap-0.5 bg-surface-2">
                  {b.coverUrls.length > 0 ? (
                    b.coverUrls.slice(0, 4).map((url, j) => (
                      // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                      <img
                        key={j}
                        src={url}
                        alt=""
                        className={`h-full w-full object-cover ${
                          b.coverUrls.length === 1 ? "col-span-2 row-span-2" : ""
                        }`}
                        loading="lazy"
                      />
                    ))
                  ) : (
                    <div className="col-span-2 row-span-2 flex items-center justify-center text-text-3">
                      <Sparkles size={20} />
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate font-serif text-[15px] italic text-text">
                    {b.name}
                  </p>
                  <MonoMeta className="mt-1 block text-[9px]">
                    {b.itemCount} {b.itemCount === 1 ? "ítem" : "ítems"}
                  </MonoMeta>
                </div>
                <div aria-hidden className="bl-grain !opacity-[0.05]" />
              </Link>
            ))}
          </div>
        )}

        {/* Full, scannable backlog grid — real artwork allowed (in-app surface) */}
        <section className="mt-10">
          <MonoMeta>Sus backlogs</MonoMeta>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {profile.backlogs.map((b) => (
              <Link
                key={b.id}
                href={`/u/${profile.username}/${b.id}`}
                className="rounded-[var(--r-lg)] border border-line bg-surface-1 p-3 transition-colors hover:bg-surface-2"
              >
                <div className="grid aspect-square grid-cols-2 gap-1 overflow-hidden rounded-[var(--r-md)] bg-surface-2">
                  {b.coverUrls.length > 0 ? (
                    b.coverUrls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- hotlinked external CDN (ADR-007)
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className={`h-full w-full object-cover ${
                          b.coverUrls.length === 1 ? "col-span-2 row-span-2" : ""
                        }`}
                        loading="lazy"
                      />
                    ))
                  ) : (
                    <div className="col-span-2 row-span-2 flex items-center justify-center text-text-3">
                      <Sparkles size={22} />
                    </div>
                  )}
                </div>
                <p className="mt-2 truncate font-semibold text-text">{b.name}</p>
                <p className="text-xs text-text-3">
                  {b.itemCount} {b.itemCount === 1 ? "ítem" : "ítems"}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-10 text-center">
          <ReportButton username={profile.username} />
        </div>
      </main>

      {/* Sticky lima CTA — the conversion pill, never scrolls out (§6) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-5">
        <Button href="/login" className="pointer-events-auto w-full shadow-[0_0_30px_var(--accent-soft)]">
          Empieza tu backlog →
        </Button>
      </div>
    </div>
  );
}
