/**
 * Crop a transparent PNG to its visible pixels (plus a small margin), so a
 * cut-out drawn on a wider canvas — e.g. a mug wrap band on OpenAI's 3:2
 * canvas — is delivered at the artwork's own shape. Non-PNG or fully opaque
 * images are returned unchanged.
 */

import { PNG } from "pngjs";

/** Alpha at or below this counts as empty (anti-aliasing haze). */
const ALPHA_EMPTY = 8;

export function trimTransparentPng(bytes: Buffer, marginPx = 12): Buffer {
  let img: PNG;
  try {
    img = PNG.sync.read(bytes);
  } catch {
    return bytes;
  }
  const { width, height, data } = img;
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > ALPHA_EMPTY) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return bytes; // nothing visible
  top = Math.max(0, top - marginPx);
  left = Math.max(0, left - marginPx);
  bottom = Math.min(height - 1, bottom + marginPx);
  right = Math.min(width - 1, right + marginPx);
  const w = right - left + 1;
  const h = bottom - top + 1;
  if (w === width && h === height) return bytes;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(img, out, left, top, w, h, 0, 0);
  return PNG.sync.write(out);
}
