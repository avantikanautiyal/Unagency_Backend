/**
 * Vendor audio protocol — maps canonical TTS/STT requests to verified wire contracts.
 */

import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { VerifiedAudioProviderSpec } from "../configs/verified-audio-provider-specs";
import type { AudioHttpRequest } from "../http/audio-http-client";

export interface VendorAudioAuthContext {
  readonly apiKey?: string;
}

export interface VendorAudioWirePlan {
  readonly request: AudioHttpRequest;
  readonly expectBinary: boolean;
  readonly inputCharacters?: number;
}

export interface VendorAudioNormalizedResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly providerRequestId?: string;
}

export interface IVendorAudioProtocol {
  readonly vendor: string;
  validateModel(spec: VerifiedAudioProviderSpec, wireModelId: string): boolean;
  buildTtsRequest(input: {
    spec: VerifiedAudioProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
    voiceId: string;
  }): VendorAudioWirePlan;
  normalizeTtsResponse(input: {
    spec: VerifiedAudioProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
    inputCharacters?: number;
  }): VendorAudioNormalizedResult;
  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string;
}

export function resolveWireModelId(modelId: string): string {
  return modelId.includes("/") ? modelId.split("/").slice(-1)[0] ?? modelId : modelId;
}

export function resolveVoiceId(
  payload: Readonly<Record<string, unknown>>,
  defaultVoiceId: string
): string {
  const voice = payload.voice;
  if (typeof voice === "string" && voice.trim()) return voice.trim();
  if (voice && typeof voice === "object") {
    const id = (voice as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return defaultVoiceId;
}
