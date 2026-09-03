import type { AvatarType } from "./shared";

/**
 * Content sniffing by magic bytes — the declared `File.type` is whatever the
 * client says it is, and the bytes are what we serve back with a
 * Content-Type, so the bytes decide. Anything that isn't one of the three
 * raster encodings a canvas emits is rejected (that includes SVG, which can
 * carry script). Pure; no image decoding happens on the server.
 */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  if (bytes.length < 12) return null;
  // RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // JPEG SOI
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG signature
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}
