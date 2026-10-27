/**
 * Shrink a PNG/JPEG to a JPEG whose longest side is at most `maxSide`, so a
 * vision check uploads ~150 KB per image instead of multi-MB PNGs. Transparent
 * pixels are flattened onto white. Anything that cannot be decoded is returned
 * unchanged.
 */

import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";

type Inline = { mimeType: string; base64: string };

function decode(bytes: Buffer, mimeType: string): { width: number; height: number; data: Uint8Array } | null {
  try {
    if (mimeType.includes("png") || bytes.subarray(1, 4).toString("ascii") === "PNG") {
      const png = PNG.sync.read(bytes);
      return { width: png.width, height: png.height, data: png.data };
    }
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
      const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
      return { width: img.width, height: img.height, data: img.data };
    }
  } catch {
    return null;
  }
  return null;
}

export function downscaleForVision(image: Inline, maxSide = 1024, quality = 85): Inline {
  const bytes = Buffer.from(image.base64, "base64");
  const src = decode(bytes, image.mimeType.toLowerCase());
  if (!src) return image;
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y / scale);
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x / scale);
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.floor((x + 1) / scale)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3]! / 255;
          r += src.data[i]! * a + 255 * (1 - a);
          g += src.data[i + 1]! * a + 255 * (1 - a);
          b += src.data[i + 2]! * a + 255 * (1 - a);
          n++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  try {
    const encoded = jpeg.encode({ data: out, width, height }, quality);
    return { mimeType: "image/jpeg", base64: Buffer.from(encoded.data).toString("base64") };
  } catch {
    return image;
  }
}
