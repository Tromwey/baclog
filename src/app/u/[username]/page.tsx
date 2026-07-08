import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/auth";
import { getPublicProfile } from "@/modules/backlog/public";
import { captureView } from "@/modules/analytics/capture";
import {
  AuraField,
  BackButton,
  Button,
  MonoMeta,
  StatusChip,
} from "@/components/ui";
import {
  ShelfCard,
  shelfSeed,
} from "@/app/(app)/backlogs/backlog-shelf-card";
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
  // Logged-in viewers (e.g. the owner via "ver perfil público") need a way back
  // and don't need the "start a backlog" pitch — that's for anonymous visitors.
  const viewer = await getCurrentUser();

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden bg-bg text-text">
      {/* The owner's persistent ADN aura (their palette, same seed as the
          in-app aura) blooming behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
      >
        <AuraField
          variant="ambient"
          colors={profile.palette}
          seed={7}
          className="!opacity-[0.6]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, transparent 28%, rgba(11,11,13,0.5) 58%, #0B0B0D 86%)",
          }}
        />
      </div>

      <main className="relative px-5 pb-32 pt-[calc(20px+env(safe-area-inset-top))]">
        {viewer && <BackButton className="mb-5" />}
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

        {/* The owner's backlogs as ADN-aura shelves — same language as the
            in-app Backlogs list. Each links to the public backlog view. */}
        <section className="mt-10">
          <MonoMeta>Sus backlogs</MonoMeta>
          <div className="mt-2">
            {profile.backlogs.map((b) => (
              <Link
                key={b.id}
                href={`/u/${profile.username}/${b.id}`}
                className="mt-4 block"
              >
                <ShelfCard
                  name={b.name}
                  itemCount={b.itemCount}
                  paletteHex={b.paletteHex}
                  seed={shelfSeed(b.id)}
                />
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-10 text-center">
          <ReportButton username={profile.username} />
        </div>
      </main>

      {/* Sticky lima CTA — the conversion pill (§6). Only for anonymous
          visitors; logged-in users get a back button instead. */}
      {!viewer && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-5">
          <Button
            href="/login"
            className="pointer-events-auto w-full shadow-[0_0_30px_var(--accent-soft)]"
          >
            Empieza tu backlog →
          </Button>
        </div>
      )}
    </div>
  );
}
