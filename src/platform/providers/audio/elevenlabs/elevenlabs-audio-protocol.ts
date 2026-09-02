/**
 * ElevenLabs TTS — verified wire contract.
 * POST /v1/text-to-speech/{voice_id}
 * Auth: xi-api-key
 */

import type {
  IVendorAudioProtocol,
  VendorAudioNormalizedResult,
  VendorAudioWirePlan,
} from "../common/vendor-audio-protocol";
import { resolveVoiceId } from "../common/vendor-audio-protocol";
import type { VerifiedAudioProviderSpec } from "../configs/verified-audio-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";

export class ElevenLabsAudioProtocol implements IVendorAudioProtocol {
  readonly vendor = "elevenlabs";

  validateModel(spec: VerifiedAudioProviderSpec, wireModelId: string): boolean {
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      wireModelId.startsWith("eleven_") ||
      wireModelId.startsWith("eleven-")
    );
  }

  buildTtsRequest(input: {
    spec: VerifiedAudioProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
    voiceId: string;
  }): VendorAudioWirePlan {
    const payload = input.request.payload;
    const text = String(payload.text ?? payload.prompt ?? payload.input ?? "");
    const voiceId = resolveVoiceId(payload, input.voiceId);
    const apiModelId =
      input.wireModelId === input.spec.inventoryModelId
        ? input.spec.wireModelId
        : input.wireModelId;
    return {
      request: {
        method: "POST",
        path: `/v1/text-to-speech/${voiceId}`,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          text,
          model_id: apiModelId,
          ...(payload.voice_settings && typeof payload.voice_settings === "object"
            ? { voice_settings: payload.voice_settings }
            : {}),
        },
        expectBinary: true,
      },
      expectBinary: true,
      inputCharacters: text.length,
    };
  }

  normalizeTtsResponse(input: {
    spec: VerifiedAudioProviderSpec;
    body: Readonly<Record<string, unknown>>;
    headers: Readonly<Record<string, string>>;
    inputCharacters?: number;
  }): VendorAudioNormalizedResult {
    const mimeType =
      typeof input.body._contentType === "string"
        ? input.body._contentType
        : input.headers["content-type"]?.split(";")[0] ?? "audio/mpeg";
    const url =
      typeof input.body._audioUrl === "string"
        ? input.body._audioUrl
        : typeof input.body.url === "string"
          ? input.body.url
          : undefined;
    return {
      output: {
        content: "[audio]",
        outputs: [
          {
            type: "audio",
            mimeType,
            url,
            storageRef:
              typeof input.body._audioStorageRef === "string"
                ? input.body._audioStorageRef
                : undefined,
            metadata: { provider: this.vendor, model: input.spec.wireModelId },
          },
        ],
      },
      usage: {
        characters: input.inputCharacters,
        outputAudioSeconds: undefined,
      },
      providerRequestId: typeof input.body.request_id === "string" ? input.body.request_id : undefined,
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    const detail = body.detail;
    if (typeof detail === "object" && detail && typeof (detail as Record<string, unknown>).message === "string") {
      return (detail as Record<string, unknown>).message as string;
    }
    if (typeof body.message === "string") return body.message;
    return `ElevenLabs HTTP ${status}`;
  }
}
