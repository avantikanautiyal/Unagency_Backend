/**
 * Canonical media output normalization for image/vision provider responses.
 */

export interface CanonicalMediaOutput {
  readonly type: "image" | "text" | "audio";
  readonly mimeType?: string;
  readonly url?: string;
  readonly storageRef?: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function mapOpenAIImageDataToOutputs(
  raw: Readonly<Record<string, unknown>>
): readonly CanonicalMediaOutput[] {
  const data = raw.data as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(data) || data.length === 0) return [];

  return data.map((item, index) => {
    const url = typeof item.url === "string" ? item.url : undefined;
    const b64 = typeof item.b64_json === "string" ? item.b64_json : undefined;
    return Object.freeze({
      type: "image" as const,
      mimeType: "image/png",
      url,
      storageRef: b64 ? `inline:base64:${index}` : undefined,
      metadata: Object.freeze({
        revisedPrompt: typeof item.revised_prompt === "string" ? item.revised_prompt : undefined,
        providerFormat: b64 ? "base64" : "url",
        // Never embed base64 body in diagnostics — reference only.
      }),
    });
  });
}

export function attachMediaOutputs(
  output: Readonly<Record<string, unknown>>,
  outputs: readonly CanonicalMediaOutput[]
): Readonly<Record<string, unknown>> {
  if (outputs.length === 0) return output;
  return Object.freeze({
    ...output,
    outputs,
    content: output.content ?? `[${outputs.length} image(s)]`,
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
