/**
 * Voice prompt STT product service (M10.15).
 *
 * Flow: upload audio → Execution Gateway → Intelligence audio.transcribe → transcript.
 * No vendor SDKs here — STT runs only through Enterprise executions.
 */

import { ApiError } from "../utils/apiError";
import { productAssetService } from "./product-asset-service";
import { attachProductAssetsToExecutionMetadata } from "./product-asset-input-bridge";
import { getEnterpriseApiRuntime } from "../platform/api/runtime/bootstrap-enterprise-api";
import type { AuthPrincipal } from "../platform/api/contracts";
import type { ExecutionResource } from "../platform/api/contracts";

const AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/x-aac",
]);

export type VoiceTranscribeResult = {
  transcript: string;
  assetId: string;
  executionId: string;
  status: string;
  mimeType: string;
  cancelled?: boolean;
};

function assertAudioMime(mimeType: string): void {
  const mime = (mimeType || "").toLowerCase().trim();
  if (!AUDIO_MIME.has(mime)) {
    throw new ApiError(
      `Unsupported audio type '${mimeType}'. Supported: m4a, wav, aac, mp3`,
      400
    );
  }
}

function principalFromLegacyUser(input: {
  userId: string;
  organizationId: string;
  workspaceId?: string;
}): AuthPrincipal {
  return {
    principalId: input.userId,
    kind: "user",
    userId: input.userId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    roles: ["member"],
  };
}

function transcriptFromExecution(resource: ExecutionResource): string {
  const text = resource.result?.text?.trim();
  if (text) return text;
  const raw = resource as ExecutionResource & {
    result?: { kind?: string; text?: string; data?: unknown };
  };
  if (typeof raw.result?.data === "string" && raw.result.data.trim()) {
    return raw.result.data.trim();
  }
  if (
    raw.result?.data &&
    typeof raw.result.data === "object" &&
    typeof (raw.result.data as { text?: unknown }).text === "string"
  ) {
    return String((raw.result.data as { text: string }).text).trim();
  }
  return "";
}

export class VoicePromptService {
  async uploadAndTranscribe(input: {
    userId: string;
    organizationId: string;
    workspaceId?: string;
    filename: string;
    mimeType: string;
    bytes: Buffer;
    language?: string;
    signal?: AbortSignal;
  }): Promise<VoiceTranscribeResult> {
    assertAudioMime(input.mimeType);
    if (input.signal?.aborted) {
      throw new ApiError("Transcription cancelled", 499);
    }

    const asset = await productAssetService.upload({
      userId: input.userId,
      organizationId: input.organizationId,
      filename: input.filename || "voice-prompt.m4a",
      mimeType: input.mimeType,
      bytes: input.bytes,
      folder: "voice-prompts",
      tags: ["voice_prompt", "stt"],
      tag: "voice_prompt",
    });

    if (input.signal?.aborted) {
      await productAssetService.delete({
        userId: input.userId,
        assetId: asset.id,
      }).catch(() => undefined);
      throw new ApiError("Transcription cancelled", 499);
    }

    return this.transcribeAsset({
      userId: input.userId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      assetId: asset.id,
      language: input.language,
      signal: input.signal,
    });
  }

  async transcribeAsset(input: {
    userId: string;
    organizationId: string;
    workspaceId?: string;
    assetId: string;
    language?: string;
    signal?: AbortSignal;
  }): Promise<VoiceTranscribeResult> {
    if (input.signal?.aborted) {
      throw new ApiError("Transcription cancelled", 499);
    }

    const asset = await productAssetService.get({
      userId: input.userId,
      assetId: input.assetId,
    });
    assertAudioMime(asset.mimeType);

    const runtime = getEnterpriseApiRuntime();
    if (!runtime?.platform?.executions) {
      throw new ApiError(
        "Execution Gateway unavailable — cannot run speech-to-text",
        503
      );
    }

    const metadata = await attachProductAssetsToExecutionMetadata({
      userId: input.userId,
      organizationId: input.organizationId,
      metadata: {
        assetIds: [input.assetId],
        frontendIntent: "TRANSCRIBE_AUDIO",
        source: "voice_prompt",
        // Pin Whisper — Direct bag defaults to gpt-4o, which OpenAI rejects for STT.
        preferredProviderId: "provider.openai",
        preferredModelId: "whisper-1",
        ...(input.language ? { language: input.language } : {}),
      },
    });

    const principal = principalFromLegacyUser({
      userId: input.userId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    });

    const created = await runtime.platform.executions.create(
      {
        prompt: "Transcribe the attached voice prompt.",
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        capabilityId: "audio.transcribe",
        metadata,
      },
      principal
    );

    if (!created.ok) {
      throw new ApiError(
        created.error.message || "Speech-to-text execution failed",
        502
      );
    }

    if (input.signal?.aborted) {
      await runtime.platform.executions
        .cancel(created.value.executionId, {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
        })
        .catch(() => undefined);
      throw new ApiError("Transcription cancelled", 499);
    }

    const resource = created.value;
    if (resource.status === "failed") {
      throw new ApiError(
        resource.errorMessage || "Speech-to-text failed",
        502
      );
    }

    const transcript = transcriptFromExecution(resource);
    if (!transcript) {
      throw new ApiError("Speech-to-text returned an empty transcript", 502);
    }

    return {
      transcript,
      assetId: input.assetId,
      executionId: resource.executionId,
      status: resource.status,
      mimeType: asset.mimeType,
    };
  }

  async cancel(input: {
    organizationId: string;
    workspaceId?: string;
    executionId: string;
  }): Promise<{ cancelled: boolean; executionId: string }> {
    const runtime = getEnterpriseApiRuntime();
    if (!runtime?.platform?.executions) {
      throw new ApiError("Execution Gateway unavailable", 503);
    }
    const result = await runtime.platform.executions.cancel(input.executionId, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    });
    if (!result.ok) {
      throw new ApiError(result.error.message || "Cancel failed", 502);
    }
    return { cancelled: true, executionId: input.executionId };
  }
}

export const voicePromptService = new VoicePromptService();
