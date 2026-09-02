/**
 * Kling AI official API — Bearer API key auth (2025+).
 * Legacy Access Key + Secret Key JWT flow is no longer used.
 * POST /v1/videos/text2video | image2video
 * Poll: GET /v1/videos/{text2video|image2video}/{task_id}
 * Status: submitted | processing | succeed | failed
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
  ProviderOperationMediaOutput,
} from "../../async/contracts/provider-operation";
import type {
  IVendorVideoProtocol,
  VendorPollPlan,
  VendorSubmitPlan,
  VendorVideoAuthContext,
} from "../common/vendor-video-protocol";
import { truncateVideoPrompt } from "../common/video-prompt-limits";

const WIRE_MODELS: Record<string, string> = {
  "kling-2-1": "kling-v2-1",
  "kling-v2-1": "kling-v2-1",
  "kling-v2-1-master": "kling-v2-1-master",
  "kling-v1": "kling-v1",
};

/** Resolve Kling API key from auth context (apiKey or legacy accessKey field). */
export function resolveKlingApiKey(auth: VendorVideoAuthContext): string | undefined {
  return auth.apiKey?.trim() || auth.accessKey?.trim() || undefined;
}

export class KlingVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "kling";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = true; // external_task_id

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix];
  }

  buildAuthHeaders(auth: VendorVideoAuthContext): Result<Readonly<Record<string, string>>> {
    const apiKey = resolveKlingApiKey(auth);
    if (!apiKey) {
      return failure(
        new ValidationError("KLING_API_KEY required (KLING_ACCESS_KEY accepted as legacy alias)")
      );
    }
    return success({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });
  }

  buildSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    imageUrls: readonly string[],
    idempotencyKey: string
  ): Result<VendorSubmitPlan> {
    const promptRaw =
      typeof request.payload.prompt === "string" ? request.payload.prompt : undefined;
    if (!promptRaw) return failure(new ValidationError("prompt required for Kling video"));
    const prompt = truncateVideoPrompt(promptRaw, "kling");

    const duration =
      typeof request.payload.duration === "number"
        ? String(request.payload.duration)
        : typeof request.payload.duration === "string"
          ? String(request.payload.duration).replace(/s$/i, "")
          : "5";
    const aspectRatio =
      typeof request.payload.aspectRatio === "string" ? request.payload.aspectRatio : "16:9";

    const body: Record<string, unknown> = {
      model_name: wireModel,
      prompt,
      duration,
      aspect_ratio: aspectRatio,
      external_task_id: idempotencyKey,
    };
    if (typeof request.payload.negativePrompt === "string") {
      body.negative_prompt = request.payload.negativePrompt;
    }

    if (imageUrls.length > 0) {
      body.image = imageUrls[0];
      return success({
        method: "POST",
        path: "/v1/videos/image2video",
        body,
      });
    }

    return success({
      method: "POST",
      path: "/v1/videos/text2video",
      body,
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const data = (body.data ?? body) as Record<string, unknown>;
    const taskId =
      typeof data.task_id === "string"
        ? data.task_id
        : typeof body.task_id === "string"
          ? body.task_id
          : undefined;
    if (!taskId) return failure(new ValidationError("Kling submit missing task_id"));
    const mode = typeof data.task_status === "string" ? data.task_status : "submitted";
    return success({
      providerJobId: taskId,
      status: mode === "succeed" ? "completed" : "pending",
      safeMetadata: { vendor: "kling" },
    });
  }

  buildPoll(providerJobId: string, _request: ProviderExecutionRequest): Result<VendorPollPlan> {
    const { mode, taskId } = decodeKlingJobId(providerJobId);
    return success({
      method: "GET",
      path: `/v1/videos/${mode}/${encodeURIComponent(taskId)}`,
    });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    const data = (body.data ?? body) as Record<string, unknown>;
    const status = String(data.task_status ?? body.task_status ?? "").toLowerCase();
    if (status === "succeed" || status === "succeeded") {
      const outputs = extractKlingOutputs(data);
      return success({ status: "completed", outputs, safeMetadata: { vendorStatus: status } });
    }
    if (status === "failed") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          typeof data.task_status_msg === "string" ? data.task_status_msg : "Kling task failed",
      });
    }
    return success({ status: "pending", nextPollAfterMs: 10_000 });
  }
}

function extractKlingOutputs(data: Record<string, unknown>): readonly ProviderOperationMediaOutput[] {
  const result = data.task_result as Record<string, unknown> | undefined;
  const videos = result?.videos as unknown;
  if (!Array.isArray(videos)) return [];
  return videos.map((v, index) => {
    const rec = v as Record<string, unknown>;
    return {
      index,
      type: "video" as const,
      mimeType: "video/mp4",
      temporaryUrl: typeof rec.url === "string" ? rec.url : undefined,
      durationSeconds: typeof rec.duration === "number" ? rec.duration : undefined,
    };
  });
}

function decodeKlingJobId(providerJobId: string): {
  mode: "text2video" | "image2video";
  taskId: string;
} {
  if (providerJobId.startsWith("image2video:")) {
    return { mode: "image2video", taskId: providerJobId.slice("image2video:".length) };
  }
  if (providerJobId.startsWith("text2video:")) {
    return { mode: "text2video", taskId: providerJobId.slice("text2video:".length) };
  }
  return { mode: "text2video", taskId: providerJobId };
}

export { WIRE_MODELS as KLING_WIRE_MODELS, decodeKlingJobId };
