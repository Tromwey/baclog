import { requireUser } from "@/auth";
import { getFollowSuggestions } from "@/modules/social/queries";
import { BackButton } from "@/components/ui";
import { PeopleSearch } from "./people-search";

/**
 * Buscar gente — /feed/gente, the follow graph's standing discovery surface.
 *
 * The feed's empty states teach by suggesting people, but the moment one
 * follow lands the feed fills with their activity and every suggestion is
 * gone: there was no way to find a second person except guessing an exact
 * @handle. This screen is that way: live search over public profiles by
 * @handle or name, and — with nothing typed — the same suggestions the empty
 * states offer, so "who else is here" always has an answer.
 *
 * Under /feed (not /perfil) so the dock keeps Feed lit: finding people is
 * about what you'll read, and the lists in /perfil stay the owner's own.
 */
export default async function GentePage() {
  const user = await requireUser();
  const suggestions = await getFollowSuggestions(user.id, 8);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md pb-dock-clearance text-text">
      <div className="flex px-4 pt-[calc(24px+env(safe-area-inset-top))]">
        <BackButton />
      </div>
      <header className="px-4 pb-5 pt-[18px]">
        <h1 className="font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.02em] text-text">
          Buscar gente
        </h1>
      </header>
      <div className="px-4 pb-10">
        <PeopleSearch suggestions={suggestions} />
      </div>
    </main>
  );
}
