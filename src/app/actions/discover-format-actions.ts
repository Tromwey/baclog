"use server";

import { redactedError } from "@/authz/safe-log";
import { assertUser } from "@/authz";
import { isCineTime, type AlbumWork, type CineWork, type SeriesWork } from "@/modules/catalog/format-moods";
import { getCineShelf, getMaratonShelf, getMusicShelf } from "@/modules/catalog/format-shelves";
import { getRenderInstant } from "@/modules/catalog/release";

/**
 * Descubrir · por formato (2a–2c): the shelves, fetched when a format page
 * opens — never on Descubrir's first paint (Todo doesn't need them). Signed-in
 * only (provider calls and catalog upserts are not for anonymous traffic);
 * nothing per-user is read.
 *
 * `[]` means the shelf ANSWERED and is empty. A failure — the provider
 * didn't answer (`ShelfUnavailableError`), the catalog write, the DB — is
 * logged and THROWN: the client (`useShelf`) turns the rejection into
 * "falló · Reintentar" and does not cache it. Returning `[]` here made an
 * outage look like "nada por aquí" with no way to retry.
 */

async function shelf<T>(name: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (err) {
    console.error(`[descubrir] ${name} shelf unavailable:`, redactedError(err));
    throw new Error(`shelf_unavailable:${name}`);
  }
}

export async function getCineShelfAction(time: number): Promise<CineWork[]> {
  await assertUser();
  if (!isCineTime(time)) return [];
  return shelf("cine", async () => getCineShelf(time, await getRenderInstant()));
}

export async function getMaratonShelfAction(): Promise<SeriesWork[]> {
  await assertUser();
  return shelf("series", getMaratonShelf);
}

export async function getMusicShelfAction(): Promise<AlbumWork[]> {
  await assertUser();
  return shelf("music", getMusicShelf);
}
