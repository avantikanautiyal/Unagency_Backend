/**
 * Priority 4.2 — Objective MP4/container metadata from bytes (no full quality engine).
 */

import type { VideoArtifactEvidence } from "./types";

type BoxInfo = {
  readonly type: string;
  readonly start: number;
  readonly size: number;
  readonly contentStart: number;
};

function readBoxes(buffer: Buffer, start: number, end: number): BoxInfo[] {
  const boxes: BoxInfo[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1 && offset + 16 <= end) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push(
      Object.freeze({
        type,
        start: offset,
        size,
        contentStart: offset + headerSize,
      }),
    );
    offset += size;
  }
  return boxes;
}

function findBox(buffer: Buffer, type: string, start = 0, end = buffer.length): BoxInfo | undefined {
  const boxes = readBoxes(buffer, start, end);
  for (const box of boxes) {
    if (box.type === type) return box;
    const nested = findBox(buffer, type, box.contentStart, box.start + box.size);
    if (nested) return nested;
  }
  return undefined;
}

function readMvhdDuration(buffer: Buffer, mvhd: BoxInfo): number | undefined {
  const base = mvhd.contentStart;
  if (base + 20 > buffer.length) return undefined;
  const version = buffer.readUInt8(base);
  if (version === 0) {
    const timescale = buffer.readUInt32BE(base + 12);
    const duration = buffer.readUInt32BE(base + 16);
    if (timescale > 0) return duration / timescale;
  } else if (version === 1 && base + 32 <= buffer.length) {
    const timescale = buffer.readUInt32BE(base + 20);
    const duration = Number(buffer.readBigUInt64BE(base + 24));
    if (timescale > 0) return duration / timescale;
  }
  return undefined;
}

function readTkhdDimensions(buffer: Buffer, tkhd: BoxInfo): { width?: number; height?: number } {
  const base = tkhd.contentStart;
  if (base + 84 > buffer.length) return {};
  const version = buffer.readUInt8(base);
  const dimOffset = version === 0 ? base + 76 : base + 88;
  if (dimOffset + 8 > buffer.length) return {};
  const width = buffer.readUInt32BE(dimOffset) / 65536;
  const height = buffer.readUInt32BE(dimOffset + 4) / 65536;
  return Object.freeze({ width, height });
}

function detectHandlers(buffer: Buffer, moov: BoxInfo): { video: boolean; audio: boolean } {
  let video = false;
  let audio = false;
  const trakBoxes = readBoxes(buffer, moov.contentStart, moov.start + moov.size).filter(
    (b) => b.type === "trak",
  );
  for (const trak of trakBoxes) {
    const mdia = findBox(buffer, "mdia", trak.contentStart, trak.start + trak.size);
    if (!mdia) continue;
    const hdlr = findBox(buffer, "hdlr", mdia.contentStart, mdia.start + mdia.size);
    if (!hdlr || hdlr.contentStart + 12 > buffer.length) continue;
    const handler = buffer.toString("ascii", hdlr.contentStart + 8, hdlr.contentStart + 12);
    if (handler === "vide") video = true;
    if (handler === "soun") audio = true;
  }
  return Object.freeze({ video, audio });
}

export function analyzeVideoBytes(bytes: Buffer, mimeType?: string): VideoArtifactEvidence {
  const evidence: string[] = [];
  const typeHint = (mimeType ?? "").toLowerCase();

  if (bytes.length < 12) {
    return Object.freeze({
      evaluated: true,
      isReadable: false,
      byteSize: bytes.length,
      containerFormat: typeHint.includes("mp4") ? "mp4" : undefined,
      confidence: "measured",
      evidence: Object.freeze(["video artifact too small to parse"]),
    });
  }

  const ftyp = findBox(bytes, "ftyp");
  const isMp4 =
    ftyp != null ||
    typeHint.includes("mp4") ||
    bytes.subarray(4, 8).toString("ascii") === "ftyp";

  if (!isMp4) {
    return Object.freeze({
      evaluated: true,
      isReadable: bytes.length > 0,
      byteSize: bytes.length,
      containerFormat: typeHint || "unknown",
      confidence: typeHint ? "measured" : "not_automated",
      evidence: Object.freeze([
        `container not recognized as MP4 (bytes=${bytes.length})`,
        "detailed video metadata NOT_AUTOMATED for non-MP4 containers",
      ]),
    });
  }

  evidence.push("MP4 ftyp box detected");
  const moov = findBox(bytes, "moov");
  if (!moov) {
    return Object.freeze({
      evaluated: true,
      isReadable: true,
      byteSize: bytes.length,
      containerFormat: "mp4",
      confidence: "measured",
      evidence: Object.freeze([...evidence, "moov box missing — metadata incomplete"]),
    });
  }

  const mvhd = findBox(bytes, "mvhd", moov.contentStart, moov.start + moov.size);
  const durationSec = mvhd ? readMvhdDuration(bytes, mvhd) : undefined;
  if (durationSec != null) evidence.push(`duration=${durationSec.toFixed(2)}s`);

  const handlers = detectHandlers(bytes, moov);
  if (handlers.video) evidence.push("video stream present");
  if (handlers.audio) evidence.push("audio stream present");

  let width: number | undefined;
  let height: number | undefined;
  const trakBoxes = readBoxes(bytes, moov.contentStart, moov.start + moov.size).filter(
    (b) => b.type === "trak",
  );
  for (const trak of trakBoxes) {
    const tkhd = findBox(bytes, "tkhd", trak.contentStart, trak.start + trak.size);
    if (!tkhd) continue;
    const dims = readTkhdDimensions(bytes, tkhd);
    if (dims.width && dims.height) {
      width = Math.round(dims.width);
      height = Math.round(dims.height);
      evidence.push(`dimensions=${width}x${height}`);
      break;
    }
  }

  return Object.freeze({
    evaluated: true,
    isReadable: true,
    byteSize: bytes.length,
    containerFormat: "mp4",
    durationSec,
    width,
    height,
    hasVideoStream: handlers.video,
    hasAudioStream: handlers.audio,
    confidence: "measured",
    evidence: Object.freeze(evidence),
  });
}
