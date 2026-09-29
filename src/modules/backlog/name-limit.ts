/**
 * How long a collection's name may be TYPED (founder, 2026-09-29): 40, measured on
 * Newsreader (~0.42 em per lowercase character) so the longest name fits the carousel's
 * two tight lines at 24 px in 256 px (~405 of 512 px, room left for word breaks).
 * The server still accepts 60 (`backlogNameSchema`) so names made before this keep
 * saving untouched; only the inputs cap at 40. Twin of iOS `AppStore.collectionNameLimit`.
 */
export const COLLECTION_NAME_MAX = 40;

/**
 * Past this many characters a name no longer fits ONE line at 30 px in 256 px
 * (256 / (0.42 · 30) ≈ 20), so the carousel sets it at 24 over two lines. iOS
 * measures the real width instead; this is the web's measured approximation.
 */
export const COLLECTION_NAME_ONE_LINE = 20;

export function isLongCollectionName(name: string): boolean {
  return name.length > COLLECTION_NAME_ONE_LINE;
}
