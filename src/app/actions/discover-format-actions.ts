"use server";

import { assertUser } from "@/authz";
import { isCineTime, type AlbumWork, type CineWork, type SeriesWork } from "@/modules/catalog/format-moods";
import { getCineShelf, getMaratonShelf, getMusicShelf } from "@/modules/catalog/format-shelves";
import { getRenderInstant } from "@/modules/catalog/release";

/**
 * Descubrir · por formato (2a–2c): the shelves, fetched when a format page
 * opens — never on Descubrir's first paint (Todo doesn't need them). Signed-in
 * only (provider calls and catalog upserts are not for anonymous traffic);
 * nothing per-user is read. Fail-open: an error is an empty shelf.
 */

export async function getCineShelfAction(time: number): Promise<CineWork[]> {
  await assertUser();
  if (!isCineTime(time)) return [];
  try {
    return await getCineShelf(time, await getRenderInstant());
  } catch (err) {
    console.error("[descubrir] cine shelf unavailable:", err);
    return [];
  }
}

export async function getMaratonShelfAction(): Promise<SeriesWork[]> {
  await assertUser();
  try {
    return await getMaratonShelf();
  } catch (err) {
    console.error("[descubrir] series shelf unavailable:", err);
    return [];
  }
}

export async function getMusicShelfAction(): Promise<AlbumWork[]> {
  await assertUser();
  try {
    return await getMusicShelf();
  } catch (err) {
    console.error("[descubrir] music shelf unavailable:", err);
    return [];
  }
}
