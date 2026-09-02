/**
 * Image artifact analysis — dimensions and integrity from actual bytes.
 */

import { decode as decodeJpeg } from "jpeg-js";
import type { ImageArtifactEvidence } from "./types";

function parsePngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const sig = bytes.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatAspectRatio(width: number, height: number): string {
  const d = gcd(width, height);
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

export function analyzeImageBytes(bytes: Buffer, mimeType?: string): ImageArtifactEvidence {
  const evidence: string[] = [];
  let width: number | undefined;
  let height: number | undefined;
  let integrityOk = bytes.length > 0;
  let format: string | undefined;
  let hasAlpha: boolean | undefined;

  const type = (mimeType ?? "").toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg") || bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = "jpeg";
    try {
      const decoded = decodeJpeg(bytes, { useTArray: true });
      width = decoded.width;
      height = decoded.height;
      evidence.push(`JPEG decoded ${width}x${height}`);
    } catch (err) {
      integrityOk = false;
      evidence.push(`JPEG decode failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (type.includes("png") || bytes.subarray(0, 4).toString("hex") === "89504e47") {
    format = "png";
    const dims = parsePngDimensions(bytes);
    if (dims) {
      width = dims.width;
      height = dims.height;
      if (bytes.length >= 26) {
        const colorType = bytes[25]!;
        hasAlpha = colorType === 4 || colorType === 6;
        evidence.push(`PNG IHDR ${width}x${height} alpha=${hasAlpha ? "yes" : "no"}`);
      } else {
        evidence.push(`PNG IHDR ${width}x${height}`);
      }
    } else {
      integrityOk = false;
      evidence.push("PNG header invalid");
    }
  } else {
    format = mimeType?.split("/")[1] ?? "unknown";
    evidence.push(`image format ${mimeType ?? "unknown"} — dimension probe not automated`);
  }

  const aspectRatio =
    width && height ? formatAspectRatio(width, height) : undefined;

  if (format) evidence.push(`format=${format}`);
  evidence.push(`byteSize=${bytes.length}`);

  return Object.freeze({
    evaluated: Boolean(width && height),
    width,
    height,
    byteSize: bytes.length,
    integrityOk,
    aspectRatio,
    format,
    hasAlpha,
    confidence: width && height ? "measured" : "not_automated",
    evidence: Object.freeze(evidence),
  });
}

export function analyzeVisualQualityFromImage(
  image: ImageArtifactEvidence,
): { score: number; evidence: readonly string[] } {
  const evidence: string[] = [];
  let score = 0;
  if (!image.evaluated || !image.width || !image.height) {
    return Object.freeze({ score: 0, evidence: Object.freeze(["image dimensions unavailable"]) });
  }
  if (image.integrityOk) {
    score += 30;
    evidence.push("image integrity verified");
  }
  const pixels = image.width * image.height;
  if (pixels >= 256 * 256) {
    score += 25;
    evidence.push(`resolution ${image.width}x${image.height}`);
  } else {
    evidence.push(`low resolution ${image.width}x${image.height}`);
  }
  if (image.byteSize > 10_000) {
    score += 20;
    evidence.push(`byte size=${image.byteSize}`);
  }
  score += 25;
  evidence.push("visual quality scored from measurable image properties (not model self-claim)");
  return Object.freeze({ score: Math.min(100, score), evidence: Object.freeze(evidence) });
}
