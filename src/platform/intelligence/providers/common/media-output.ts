/**
 * Canonical media output normalization for image/vision provider responses.
 */

export interface CanonicalMediaOutput {
  readonly type: "image" | "text" | "audio";
  readonly mimeType?: string;
  readonly url?: string;
  /** Raw base64 payload for ingestion — never log this field. */
  readonly base64?: string;
  readonly storageRef?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function pickImageBase64(item: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of ["b64_json", "b64", "base64", "image_base64"] as const) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function pickImageUrl(item: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of ["url", "image_url"] as const) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Normalize OpenAI/Gemini-style image data arrays into canonical media outputs. */
export function mapOpenAIImageDataToOutputs(
  raw: Readonly<Record<string, unknown>>
): readonly CanonicalMediaOutput[] {
  const data = Array.isArray(raw.data)
    ? (raw.data as Array<Record<string, unknown>>)
    : undefined;
  if (!data || data.length === 0) return [];

  return data
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const url = pickImageUrl(item);
      const b64 = pickImageBase64(item);
      if (!url && !b64) return null;
      const mimeType =
        typeof item.mime_type === "string"
          ? item.mime_type
          : typeof item.mimeType === "string"
            ? item.mimeType
            : "image/png";
      return Object.freeze({
        type: "image" as const,
        mimeType,
        // Prefer vendor HTTPS URL; keep base64 separate (avoid doubling multi-MB strings).
        url: url && /^https?:\/\//i.test(url) ? url : undefined,
        base64: b64,
        storageRef: b64 ? `inline:base64:${index}` : undefined,
        metadata: Object.freeze({
          revisedPrompt:
            typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
          providerFormat: b64 ? "base64" : "url",
        }),
      });
    })
    .filter((item): item is CanonicalMediaOutput => item != null);
}

export function attachMediaOutputs(
  output: Readonly<Record<string, unknown>>,
  outputs: readonly CanonicalMediaOutput[]
): Readonly<Record<string, unknown>> {
  if (outputs.length === 0) return output;
  return Object.freeze({
    ...output,
    outputs,
    // Always replace non-string vendor payloads (e.g. raw data[]) with a stable summary.
    content: `[${outputs.length} image(s)]`,
  });
}

export function normalizeImageUsage(
  raw: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!raw) return undefined;
  const imagesGenerated =
    typeof raw.images === "number"
      ? raw.images
      : Array.isArray(raw.data)
        ? raw.data.length
        : undefined;
  if (imagesGenerated === undefined) return undefined;
  return Object.freeze({ imagesGenerated });
}

export function mapBinaryAudioToOutput(input: {
  readonly mimeType: string;
  readonly url?: string;
  readonly storageRef?: string;
  readonly durationSeconds?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): CanonicalMediaOutput {
  return Object.freeze({
    type: "audio",
    mimeType: input.mimeType,
    url: input.url,
    storageRef: input.storageRef,
    durationSeconds: input.durationSeconds,
    metadata: Object.freeze({
      ...(input.metadata ?? {}),
      providerFormat: input.url ? "url" : "binary_ref",
    }),
  });
}

export function mapTranscriptToOutput(input: {
  readonly text: string;
  readonly language?: string;
  readonly durationSeconds?: number;
  readonly segments?: readonly unknown[];
  readonly confidence?: number;
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    content: input.text,
    transcript: Object.freeze({
      text: input.text,
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.segments !== undefined ? { segments: input.segments } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    }),
  });
}

export function normalizeAudioUsage(
  raw: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!raw) return undefined;
  const usage: Record<string, unknown> = {};
  if (typeof raw.characters === "number") usage.characters = raw.characters;
  if (typeof raw.audioSeconds === "number") usage.audioSeconds = raw.audioSeconds;
  if (typeof raw.inputAudioSeconds === "number") usage.inputAudioSeconds = raw.inputAudioSeconds;
  if (typeof raw.outputAudioSeconds === "number") usage.outputAudioSeconds = raw.outputAudioSeconds;
  if (typeof raw.transcriptionSeconds === "number") {
    usage.transcriptionSeconds = raw.transcriptionSeconds;
  }
  return Object.keys(usage).length > 0 ? Object.freeze(usage) : undefined;
}
