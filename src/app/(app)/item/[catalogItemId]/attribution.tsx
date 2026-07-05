/**
 * Mandatory attributions (ADR-007/ADR-008): TMDB logo+legend for video,
 * JustWatch for provider data (G4), Apple Music badge next to music
 * artwork. Rendered on every item surface, private and public.
 */
export function Attribution({
  source,
  mediaType,
}: {
  source: string;
  mediaType: string;
}) {
  return (
    <footer className="mt-10 space-y-1 border-t border-neutral-800 pt-4 text-[11px] leading-relaxed text-neutral-500">
      {source === "tmdb" && (
        <p>
          Datos e imágenes de{" "}
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            TMDB
          </a>
          . Este producto usa la API de TMDB pero no está avalado ni
          certificado por TMDB. Disponibilidad de streaming por{" "}
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
      )}
      {mediaType === "album" && (
        <p>
          Datos y portadas de{" "}
          <a
            href="https://music.apple.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Apple Music
          </a>
          .
        </p>
      )}
    </footer>
  );
}
