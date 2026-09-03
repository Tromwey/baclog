import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "./shared";

/**
 * F3.11 — on-device preparation of a profile photo (client only, same
 * posture as the palette extraction: the browser does the image work, the
 * server never decodes pixels). Whatever the user picks — a 12 MP camera
 * shot, a screenshot, a PNG with alpha — comes out as a AVATAR_SIZE square:
 * center-cropped, EXIF orientation applied, encoded as WebP (JPEG where the
 * browser can't encode WebP), and under AVATAR_MAX_BYTES or the promise
 * rejects. iOS hands HEIC to a file input as JPEG already, so the decoder
 * never sees it.
 */
export async function prepareAvatarBlob(file: File): Promise<Blob> {
  const source = await loadSource(file);
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height =
    "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error("undecodable");

  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  // Alpha lands on the page background, not on black (the JPEG fallback has
  // no alpha channel, and a transparent PNG should look the same either way).
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(source, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  if ("close" in source) source.close();

  const webp = await encode(canvas, "image/webp", 0.84);
  if (webp && webp.type === "image/webp" && webp.size <= AVATAR_MAX_BYTES) {
    return webp;
  }
  const jpeg = await encode(canvas, "image/jpeg", 0.82);
  if (jpeg && jpeg.type === "image/jpeg" && jpeg.size <= AVATAR_MAX_BYTES) {
    return jpeg;
  }
  throw new Error("too-large");
}

/**
 * createImageBitmap applies EXIF orientation ("from-image") and decodes off
 * the main thread; the <img> path is the fallback for browsers that reject
 * the file there (older Safari on some encodings).
 */
async function loadSource(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
