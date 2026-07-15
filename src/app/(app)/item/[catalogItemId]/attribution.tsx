import Link from "next/link";

/**
 * TMDB's own FAQ allows centralizing the general attribution + disclaimer
 * in an "About"/"Credits" section instead of repeating it per page — the
 * full text now lives at /creditos. This is just the pointer to it.
 */
export function CreditsLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/creditos"
      className={`text-[11px] text-text-3 underline ${className}`}
    >
      Créditos
    </Link>
  );
}

/**
 * JustWatch attribution can't be centralized the same way as the general
 * TMDB text — it has to stay next to the watch-provider link it labels.
 * Film/series only: albums resolve via Odesli/Spotify/Apple Music/YouTube
 * Music, never JustWatch (see resolveVideoLink in modules/links/resolve.ts).
 */
export function JustWatchNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] text-text-3 ${className}`}>
      Disponibilidad por{" "}
      <a
        href="https://www.justwatch.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        JustWatch
      </a>
      .
    </p>
  );
}
