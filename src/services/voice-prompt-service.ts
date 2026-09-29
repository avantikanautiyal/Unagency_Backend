/**
 * Voice prompt STT product service (M10.15).
 *
 * Flow: upload audio → Execution Gateway → Intelligence audio.transcribe → transcript.
 * Live multipart uploads take a direct low-latency path (see `transcribeDirect`);
 * stored-asset transcription still runs through Enterprise executions.
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
  // Browser MediaRecorder (Chrome/Firefox) produces WebM, often with a codec suffix.
  "audio/webm",
]);

/** `audio/webm;codecs=opus` → `audio/webm` so the allowlist matches what browsers send. */
function normalizeAudioMime(mimeType: string): string {
  return (mimeType || "").toLowerCase().trim().split(";")[0]?.trim() || "";
}

export type VoiceTranscribeResult = {
  transcript: string;
  assetId: string;
  executionId: string;
  status: string;
  mimeType: string;
  cancelled?: boolean;
};

const DIRECT_EXECUTION_PREFIX = "stt_direct_";
const DIRECT_STT_TIMEOUT_MS = 15_000;
/** How long to wait for the background asset upload after the transcript is ready. */
const ASSET_UPLOAD_GRACE_MS = 300;

/**
 * Low-latency STT for live voice prompts: send the in-memory upload straight to
 * OpenAI. The queued Execution Gateway path adds worker polling, asset
 * round-trips and post-processing (~8–12s) — far too slow for dictation.
 * Disable with VOICE_STT_FAST_PATH=false.
 */
function directSttApiKey(): string | null {
  if (process.env.VOICE_STT_FAST_PATH?.trim().toLowerCase() === "false") return null;
  if (process.env.ENTERPRISE_API_EXECUTION_MODE?.trim().toLowerCase() !== "live") {
    return null;
  }
  return process.env.OPENAI_API_KEY?.trim() || null;
}

async function transcribeDirect(input: {
  apiKey: string;
  bytes: Buffer;
  filename: string;
  mimeType: string;
  language?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
    input.filename
  );
  form.append("model", process.env.VOICE_STT_MODEL?.trim() || "whisper-1");
  form.append("response_format", "json");
  if (input.language) form.append("language", input.language);

  const timeout = AbortSignal.timeout(DIRECT_STT_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal,
    });
  } catch (err) {
    if (input.signal?.aborted) throw new ApiError("Transcription cancelled", 499);
    if (timeout.aborted) throw new ApiError("Speech-to-text timed out", 504);
    throw new ApiError(
      `Speech-to-text request failed: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      `Speech-to-text failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      502
    );
  }
  const body = (await res.json()) as { text?: unknown };
  return typeof body.text === "string" ? body.text.trim() : "";
}

function assertAudioMime(mimeType: string): string {
  const mime = normalizeAudioMime(mimeType);
  if (!AUDIO_MIME.has(mime)) {
    throw new ApiError(
      `Unsupported audio type '${mimeType}'. Supported: m4a, wav, aac, mp3, webm`,
      400
    );
  }
  return mime;
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
    const mimeType = assertAudioMime(input.mimeType);
    if (input.signal?.aborted) {
      throw new ApiError("Transcription cancelled", 499);
    }

    const filename = input.filename || "voice-prompt.m4a";
    const uploadAsset = () =>
      productAssetService.upload({
        userId: input.userId,
        organizationId: input.organizationId,
        filename,
        mimeType,
        bytes: input.bytes,
        folder: "voice-prompts",
        tags: ["voice_prompt", "stt"],
        tag: "voice_prompt",
      });

    const apiKey = directSttApiKey();
    if (apiKey) {
      // Persist the recording in parallel; never block the transcript on storage.
      const upload = uploadAsset().then(
        (a) => a.id,
        () => ""
      );
      const transcript = await transcribeDirect({
        apiKey,
        bytes: input.bytes,
        filename,
        mimeType,
        language: input.language,
        signal: input.signal,
      });
      if (!transcript) {
        throw new ApiError("Speech-to-text returned an empty transcript", 502);
      }
      const assetId = await Promise.race([
        upload,
        new Promise<string>((resolve) => setTimeout(() => resolve(""), ASSET_UPLOAD_GRACE_MS)),
      ]);
      return {
        transcript,
        assetId,
        executionId: `${DIRECT_EXECUTION_PREFIX}${Date.now()}`,
        status: "succeeded",
        mimeType,
      };
    }

    const asset = await uploadAsset();

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
    // Direct STT requests are cancelled by the client aborting the HTTP call.
    if (input.executionId.startsWith(DIRECT_EXECUTION_PREFIX)) {
      return { cancelled: true, executionId: input.executionId };
    }
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
