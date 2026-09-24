import { Wordmark } from "@/components/kura/components";

export const metadata = {
  title: "créditos · kura",
};

/**
 * Single "About/Credits" surface for third-party attribution (TMDB's own FAQ:
 * "the attribution must be within your application's 'About' or 'Credits'
 * type section" — themoviedb.org/docs/faq). Centralizing here replaces the
 * per-page footers that used to repeat this text on every item/backlog
 * surface. Per-item JustWatch attribution stays next to the watch button
 * (see item pages) — that one can't be centralized the same way.
 *
 * Kura: Newsreader for the title and the three sections, Hanken 15 for the
 * body, links underlined in the text colour (§voz · títulos en minúscula).
 */
export default function CreditosPage() {
  const link = "underline decoration-text-3 underline-offset-[3px] text-text transition-opacity active:opacity-60";
  return (
    <main className="kura relative mx-auto flex min-h-lvh w-full max-w-md flex-col bg-bg px-6 pb-16 text-text">
      <header className="flex items-center pt-[calc(64px+env(safe-area-inset-top))]">
        <Wordmark size={30} />
      </header>
      <div className="mt-[62px] flex flex-col gap-3">
        <h1 className="font-brand text-[40px] leading-none text-text">créditos.</h1>
        <p className="text-[15px] leading-[1.5] text-text-2">
          Kura usa datos e imágenes de los siguientes servicios.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-8 text-[15px] leading-[1.55] text-text-2">
        <section className="flex flex-col gap-2">
          <h2 className="font-brand text-[24px] leading-[1.1] text-text">películas y series</h2>
          <p>
            Datos e imágenes de{" "}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className={link}>
              TMDB
            </a>
            . Este producto usa la API de TMDB pero no está avalado ni
            certificado por TMDB.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-brand text-[24px] leading-[1.1] text-text">dónde ver</h2>
          <p>
            Disponibilidad de streaming por{" "}
            <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" className={link}>
              JustWatch
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-brand text-[24px] leading-[1.1] text-text">música</h2>
          <p>
            Datos y portadas de{" "}
            <a href="https://music.apple.com" target="_blank" rel="noopener noreferrer" className={link}>
              Apple Music
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-brand text-[24px] leading-[1.1] text-text">tipografías</h2>
          <p>
            Newsreader, Hanken Grotesk y Red Hat Mono, bajo la SIL Open Font
            License.
          </p>
        </section>
      </div>
    </main>
  );
}
