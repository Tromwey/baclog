export const metadata = {
  title: "Créditos · Baclog",
};

/**
 * Single "About/Credits" surface for third-party attribution (TMDB's own FAQ:
 * "the attribution must be within your application's 'About' or 'Credits'
 * type section" — themoviedb.org/docs/faq). Centralizing here replaces the
 * per-page footers that used to repeat this text on every item/backlog
 * surface. Per-item JustWatch attribution stays next to the watch button
 * (see item pages) — that one can't be centralized the same way.
 */
export default function CreditosPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-6 pb-16 pt-12 text-text">
      <h1 className="font-display text-2xl font-bold tracking-[-0.01em]">
        Créditos
      </h1>
      <p className="mt-2 text-sm text-text-2">
        Baclog usa datos e imágenes de los siguientes servicios.
      </p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-text-2">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
            Películas y series
          </h2>
          <p className="mt-2">
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
            certificado por TMDB.
          </p>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
            Dónde ver
          </h2>
          <p className="mt-2">
            Disponibilidad de streaming por{" "}
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
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
            Música
          </h2>
          <p className="mt-2">
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
        </section>
      </div>
    </main>
  );
}
