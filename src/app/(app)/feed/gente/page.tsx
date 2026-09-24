import { requireUser } from "@/auth";
import { getFollowSuggestions } from "@/modules/social/queries";
import { BackButton } from "@/components/ui";
import { PeopleSearch } from "./people-search";

/**
 * Tu gente — /feed/gente, the follow graph's standing discovery surface (and
 * where the feed's bell leads: the product has no notifications, 31a).
 *
 * Live search over public profiles by @usuario or name and — with nothing
 * typed — the same suggestions the empty feed offers, so "who else is here"
 * always has an answer. Under /feed (not /perfil) so the dock keeps Feed lit.
 *
 * Kura: Volver 44 glass, the title in Newsreader 36 lowercase, the search
 * field in glass, people in 72 rows (seal 44).
 */
export default async function GentePage() {
  const user = await requireUser();
  const suggestions = await getFollowSuggestions(user.id, 8);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-bg pb-dock-clearance text-text">
      <div className="flex px-6 pt-[calc(16px+env(safe-area-inset-top))]">
        <BackButton className="h-11! w-11!" />
      </div>
      <h1 className="px-6 pb-5 pt-4 font-brand text-[36px] leading-[1.02] text-text">tu gente</h1>
      <div className="px-5 pb-10">
        <PeopleSearch suggestions={suggestions} />
      </div>
    </main>
  );
}
