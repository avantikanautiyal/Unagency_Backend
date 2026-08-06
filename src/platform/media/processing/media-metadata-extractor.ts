/**
 * M10.18 — Lightweight media metadata extraction (no sharp/ffmpeg required).
 * Hooks remain for full probe workers when binaries are available.
 */

export type ImageMediaMeta = {
  width?: number;
  height?: number;
  orientation?: number;
  format?: string;
};

export type VideoMediaMeta = {
  durationMs?: number;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  previewAvailable?: boolean;
};

export type AudioMediaMeta = {
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
  waveformPeaks?: number[];
};

export type ExtractedMediaMeta = {
  image?: ImageMediaMeta;
  video?: VideoMediaMeta;
  audio?: AudioMediaMeta;
  extractedAt: string;
  extractor: string;
};

function readPngSize(buf: Buffer): ImageMediaMeta | undefined {
  if (buf.length < 24) return undefined;
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return undefined;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, format: "png", orientation: 1 };
}

function readJpegSize(buf: Buffer): ImageMediaMeta | undefined {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height, format: "jpeg", orientation: 1 };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return undefined;
}

function readWebpSize(buf: Buffer): ImageMediaMeta | undefined {
  if (buf.length < 30) return undefined;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return undefined;
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 " && buf.length >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height, format: "webp", orientation: 1 };
  }
  if (chunk === "VP8L" && buf.length >= 25) {
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height, format: "webp", orientation: 1 };
  }
  return undefined;
}

/** Best-effort in-process probe; video/audio full probe is a queued hook. */
export function extractBasicMediaMeta(input: {
  mimeType: string;
  bytes: Buffer;
}): ExtractedMediaMeta {
  const mime = input.mimeType.toLowerCase();
  const extractedAt = new Date().toISOString();
  if (mime.startsWith("image/")) {
    const image =
      readPngSize(input.bytes) ||
      readJpegSize(input.bytes) ||
      readWebpSize(input.bytes) ||
      { format: mime.split("/")[1] };
    return { image, extractedAt, extractor: "basic-image-headers" };
  }
  if (mime.startsWith("video/")) {
    return {
      video: { previewAvailable: false },
      extractedAt,
      extractor: "basic-video-stub",
    };
  }
  if (mime.startsWith("audio/")) {
    // Placeholder peaks for UI waveform hooks (non-blocking; real DSP later)
    const peaks = Array.from({ length: 32 }, (_, i) =>
      Math.round(20 + 60 * Math.abs(Math.sin(i / 3 + input.bytes.byteLength % 7)))
    );
    return {
      audio: { waveformPeaks: peaks },
      extractedAt,
      extractor: "basic-audio-stub",
    };
  }
  return { extractedAt, extractor: "none" };
}
