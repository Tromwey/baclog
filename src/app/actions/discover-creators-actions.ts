"use server";

import { assertUser } from "@/authz";
import { getNewFromCreators, type CreatorNewItem } from "@/modules/discover/creators-new";

/**
 * Descubrir · "lo nuevo de tus favoritos": fetched after first paint (its
 * provider fan-out is too slow for the page's critical path). Signed-in only;
 * the viewer comes from the session, never from the caller. Fail-open: an
 * error is an empty section, logged.
 */
export async function getNewFromCreatorsAction(): Promise<CreatorNewItem[]> {
  const user = await assertUser();
  try {
    return await getNewFromCreators(user.id, Date.now());
  } catch (err) {
    console.error("[descubrir] new from creators unavailable:", err);
    return [];
  }
}
