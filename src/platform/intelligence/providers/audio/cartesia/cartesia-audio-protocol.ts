/**
 * Cartesia TTS — verified wire contract.
 * POST /tts/bytes
 * Auth: X-API-Key, Cartesia-Version
 */

import type {
  IVendorAudioProtocol,
  VendorAudioNormalizedResult,
  VendorAudioWirePlan,
} from "../common/vendor-audio-protocol";
import { resolveVoiceId } from "../common/vendor-audio-protocol";
import type { VerifiedAudioProviderSpec } from "../configs/verified-audio-provider-specs";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";

const CARTESIA_API_VERSION = "2024-06-10";

export class CartesiaAudioProtocol implements IVendorAudioProtocol {
  readonly vendor = "cartesia";

  validateModel(spec: VerifiedAudioProviderSpec, wireModelId: string): boolean {
    return (
      wireModelId === spec.inventoryModelId ||
      wireModelId === spec.wireModelId ||
      wireModelId.startsWith("sonic")
    );
  }

  buildTtsRequest(input: {
    spec: VerifiedAudioProviderSpec;
    request: ProviderExecutionRequest;
    wireModelId: string;
    voiceId: string;
  }): VendorAudioWirePlan {
    const payload = input.request.payload;
    const transcript = String(payload.text ?? payload.prompt ?? payload.input ?? "");
    const voiceId = resolveVoiceId(payload, input.voiceId);
    const format =
      payload.format && typeof payload.format === "object"
        ? payload.format
        : { container: "mp3", sample_rate: 44100 };

    return {
      request: {
        method: "POST",
        path: "/tts/bytes",
        headers: {
          "Content-Type": "application/json",
          "Cartesia-Version": CARTESIA_API_VERSION,
        },
        body: {
          model_id: input.wireModelId,
          transcript,
          voice: { mode: "id", id: voiceId },
          output_format: format,
          ...(payload.language ? { language: payload.language } : {}),
        },
        expectBinary: true,
      },
      expectBinary: true,
      inputCharacters: transcript.length,
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
      },
    };
  }

  mapProviderError(status: number, body: Readonly<Record<string, unknown>>): string {
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
    return `Cartesia HTTP ${status}`;
  }
}
