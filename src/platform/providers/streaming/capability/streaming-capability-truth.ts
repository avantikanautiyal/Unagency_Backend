/**
 * M9.5O1 — Streaming capability truth (catalogue ≠ runtime).
 */

export type StreamingCapabilityClass =
  | "NATIVE_STREAM_CONTRACT_VERIFIED"
  | "WIRE_COMPATIBLE_WITH_VERIFIED_ADAPTER"
  | "CONTRACT_PARTIAL"
  | "CONTRACT_UNVERIFIED"
  | "NOT_SUPPORTED";

export interface StreamingProviderTruth {
  readonly providerId: string;
  readonly catalogueStreamingClaim: boolean;
  readonly nativeStreamingVerified: boolean;
  readonly streamingRuntimeImplemented: boolean;
  readonly parserImplemented: boolean;
  /** Executable only when verified + implemented + configured. */
  readonly streamingExecutable: boolean;
  readonly configured: boolean;
  readonly classification: StreamingCapabilityClass;
  readonly wireFamily?: "openai" | "openai_compatible" | "anthropic" | "binary_audio";
  readonly blocker?: string;
}

/**
 * Catalogue claim alone cannot make a provider stream-executable.
 */
export function isStreamExecutable(truth: StreamingProviderTruth): boolean {
  return (
    truth.nativeStreamingVerified === true &&
    truth.streamingRuntimeImplemented === true &&
    truth.parserImplemented === true &&
    truth.configured === true &&
    truth.streamingExecutable === true
  );
}

export function buildStreamingTruthMatrix(input: {
  readonly configuredProviderIds: ReadonlySet<string>;
}): readonly StreamingProviderTruth[] {
  const configured = input.configuredProviderIds;

  const openaiNative = (providerId: string): StreamingProviderTruth => ({
    providerId,
    catalogueStreamingClaim: true,
    nativeStreamingVerified: true,
    streamingRuntimeImplemented: true,
    parserImplemented: true,
    streamingExecutable: configured.has(providerId),
    configured: configured.has(providerId),
    classification: "NATIVE_STREAM_CONTRACT_VERIFIED",
    wireFamily: "openai",
  });

  const openaiCompat = (providerId: string): StreamingProviderTruth => ({
    providerId,
    catalogueStreamingClaim: true,
    nativeStreamingVerified: true,
    streamingRuntimeImplemented: true,
    parserImplemented: true,
    streamingExecutable: configured.has(providerId),
    configured: configured.has(providerId),
    classification: "WIRE_COMPATIBLE_WITH_VERIFIED_ADAPTER",
    wireFamily: "openai_compatible",
  });

  return [
    openaiNative("provider.openai"),
    {
      providerId: "provider.anthropic",
      catalogueStreamingClaim: true,
      nativeStreamingVerified: true,
      streamingRuntimeImplemented: true,
      parserImplemented: true,
      streamingExecutable: configured.has("provider.anthropic"),
      configured: configured.has("provider.anthropic"),
      classification: "NATIVE_STREAM_CONTRACT_VERIFIED",
      wireFamily: "anthropic",
    },
    openaiCompat("provider.groq"),
    openaiCompat("provider.deepseek"),
    openaiCompat("provider.mistral"),
    openaiCompat("provider.openrouter"),
    openaiCompat("provider.together"),
    openaiCompat("provider.fireworks"),
    openaiCompat("provider.xai"),
    {
      providerId: "provider.gemini",
      catalogueStreamingClaim: true,
      nativeStreamingVerified: false,
      streamingRuntimeImplemented: false,
      parserImplemented: false,
      streamingExecutable: false,
      configured: configured.has("provider.gemini"),
      classification: "CONTRACT_UNVERIFIED",
      blocker: "no_verified_streamGenerateContent_parser_in_repo",
    },
    {
      providerId: "provider.cohere",
      catalogueStreamingClaim: true,
      nativeStreamingVerified: false,
      streamingRuntimeImplemented: false,
      parserImplemented: false,
      streamingExecutable: false,
      configured: configured.has("provider.cohere"),
      classification: "CONTRACT_UNVERIFIED",
      blocker: "no_verified_cohere_stream_parser_in_repo",
    },
    {
      providerId: "provider.elevenlabs",
      catalogueStreamingClaim: false,
      nativeStreamingVerified: false,
      streamingRuntimeImplemented: true, // binary path scaffold
      parserImplemented: true,
      streamingExecutable: false,
      configured: configured.has("provider.elevenlabs"),
      classification: "CONTRACT_PARTIAL",
      wireFamily: "binary_audio",
      blocker: "unagencyStreamingActivated=false_until_live_leaf_wired",
    },
    {
      providerId: "provider.cartesia",
      catalogueStreamingClaim: false,
      nativeStreamingVerified: false,
      streamingRuntimeImplemented: true,
      parserImplemented: true,
      streamingExecutable: false,
      configured: configured.has("provider.cartesia"),
      classification: "CONTRACT_PARTIAL",
      wireFamily: "binary_audio",
      blocker: "unagencyStreamingActivated=false_until_live_leaf_wired",
    },
  ];
}

/** Guard: catalogue-only claim must never activate streaming without parser. */
export function catalogueClaimCannotActivateWithoutParser(
  truth: StreamingProviderTruth
): boolean {
  if (!truth.catalogueStreamingClaim) return true;
  if (!truth.parserImplemented) return !truth.streamingExecutable;
  return true;
}
