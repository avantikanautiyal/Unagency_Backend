/**
 * Derive adapter modality and features from canonical capability id.
 */

import type { ProviderModality } from "../adapters/contracts/enums";

export function resolveExecutionModality(capabilityId: string): ProviderModality {
  const cap = capabilityId.toLowerCase();
  if (
    cap.startsWith("video.") ||
    cap === "video.generate" ||
    cap === "video.short_form_generation" ||
    cap === "video.avatar_generation"
  ) {
    return "video";
  }
  if (cap.startsWith("image.") || cap === "image.generate" || cap === "image.edit") {
    return "image";
  }
  if (
    cap.startsWith("audio.") ||
    cap === "audio.speech_generation" ||
    cap === "audio.music_generation" ||
    cap === "audio.sfx_generation" ||
    cap.startsWith("speech.") ||
    cap.startsWith("voice.") ||
    cap.startsWith("music.") ||
    cap.startsWith("sound_effect.")
  ) {
    return "audio";
  }
  if (cap === "vision.analyze" || cap.startsWith("vision.")) {
    return "multimodal";
  }
  if (cap.includes("embedding")) return "embedding";
  return "text";
}

export function resolveExecutionFeatures(capabilityId: string): readonly string[] {
  const cap = capabilityId.toLowerCase();
  if (cap === "vision.analyze" || cap.startsWith("vision.")) return ["vision"];
  if (cap.startsWith("image.")) return [];
  if (cap === "embedding.generate" || cap.includes("embedding")) return ["embeddings"];
  return [];
}

export function isImageGenerationCapability(capabilityId: string): boolean {
  return capabilityId.toLowerCase() === "image.generate";
}

export function isVisionCapability(capabilityId: string): boolean {
  const cap = capabilityId.toLowerCase();
  return cap === "vision.analyze" || cap.startsWith("vision.");
}

export function isVideoGenerationCapability(capabilityId: string): boolean {
  const cap = capabilityId.toLowerCase();
  return (
    cap === "video.generate" ||
    cap === "video.short_form_generation" ||
    cap === "video.avatar_generation" ||
    cap.startsWith("video.")
  );
}

export function isImageGenerationCapability(capabilityId: string): boolean {
  const cap = capabilityId.toLowerCase();
  return (
    cap === "image.generate" ||
    cap === "image.edit" ||
    (cap.startsWith("image.") && !cap.includes("vision"))
  );
}

/** Media capabilities that use durable async orchestration when asyncMedia is enabled. */
export function isAsyncMediaCapability(capabilityId: string): boolean {
  return (
    isVideoGenerationCapability(capabilityId) ||
    isImageGenerationCapability(capabilityId)
  );
}

/** Runtime capability ids (registry) and catalog aliases map here. */
export function normalizeAudioCapabilityId(capabilityId: string): string {
  const cap = capabilityId.toLowerCase();
  if (cap === "audio.speech_generation" || cap === "speech.generate" || cap === "speech.synthesize") {
    return "audio.synthesize";
  }
  if (cap === "speech.transcribe" || cap === "audio.transcribe") return "audio.transcribe";
  if (cap === "audio.music_generation" || cap === "music.generate") return "audio.music_generation";
  if (cap === "audio.sfx_generation" || cap === "sound_effect.generate") {
    return "audio.sfx_generation";
  }
  return cap;
}

export function isAudioTranscribeCapability(capabilityId: string): boolean {
  return normalizeAudioCapabilityId(capabilityId) === "audio.transcribe";
}

export function isAudioSynthesizeCapability(capabilityId: string): boolean {
  return normalizeAudioCapabilityId(capabilityId) === "audio.synthesize";
}

export function isAudioAnalyzeCapability(capabilityId: string): boolean {
  const cap = capabilityId.toLowerCase();
  return cap === "audio.analyze" || cap === "audio.understand";
}

export function isAudioMusicCapability(capabilityId: string): boolean {
  return normalizeAudioCapabilityId(capabilityId) === "audio.music_generation";
}

export function isEmbeddingCapability(capabilityId: string): boolean {
  const cap = capabilityId.toLowerCase();
  return (
    cap === "embedding.generate" ||
    cap === "text.embed" ||
    cap.includes("embedding")
  );
}
