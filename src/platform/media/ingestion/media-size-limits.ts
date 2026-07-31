/**
 * Bounded media ingestion size limits by category.
 */

export type MediaCategory = "image" | "audio" | "video" | "other";

export interface MediaSizeLimits {
  readonly imageMaxBytes: number;
  readonly audioMaxBytes: number;
  readonly videoMaxBytes: number;
  readonly otherMaxBytes: number;
}

export const DEFAULT_MEDIA_SIZE_LIMITS: MediaSizeLimits = {
  imageMaxBytes: 25 * 1024 * 1024,
  audioMaxBytes: 100 * 1024 * 1024,
  videoMaxBytes: 500 * 1024 * 1024,
  otherMaxBytes: 50 * 1024 * 1024,
};

export function maxBytesForCategory(
  category: MediaCategory,
  limits: MediaSizeLimits = DEFAULT_MEDIA_SIZE_LIMITS
): number {
  switch (category) {
    case "image":
      return limits.imageMaxBytes;
    case "audio":
      return limits.audioMaxBytes;
    case "video":
      return limits.videoMaxBytes;
    default:
      return limits.otherMaxBytes;
  }
}

export function inferMediaCategory(mimeType?: string): MediaCategory {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}
