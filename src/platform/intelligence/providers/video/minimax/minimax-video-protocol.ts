/**
 * MiniMax Hailuo Video API — verified from https://platform.minimax.io/docs/guides/video-generation
 * Base: https://api.minimax.io
 * Auth: Bearer
 * Submit: POST /v1/video_generation
 * Poll: GET /v1/query/video_generation?task_id=
 * File: GET /v1/files/retrieve?file_id=
 * Status: Success | Fail | Preparing | Queueing | Processing
 * Model: MiniMax-Hailuo-2.3
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
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

const WIRE_MODELS: Record<string, string> = {
  "hailuo-ai": "MiniMax-Hailuo-2.3",
  "MiniMax-Hailuo-2.3": "MiniMax-Hailuo-2.3",
  "minimax-hailuo-2.3": "MiniMax-Hailuo-2.3",
};

export class MinimaxVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "minimax";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = false;

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix];
  }

  buildAuthHeaders(auth: VendorVideoAuthContext): Result<Readonly<Record<string, string>>> {
    if (!auth.apiKey?.trim()) return failure(new ValidationError("MINIMAX_API_KEY required"));
    return success({
      Authorization: `Bearer ${auth.apiKey}`,
      "Content-Type": "application/json",
    });
  }

  buildSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    imageUrls: readonly string[],
    _idempotencyKey: string
  ): Result<VendorSubmitPlan> {
    const prompt =
      typeof request.payload.prompt === "string" ? request.payload.prompt : undefined;
    if (!prompt) return failure(new ValidationError("prompt required for MiniMax video"));

    const duration =
      typeof request.payload.duration === "number"
        ? request.payload.duration
        : 6;
    const resolution =
      typeof request.payload.resolution === "string"
        ? String(request.payload.resolution).toUpperCase().replace("P", "P")
        : "768P";

    const body: Record<string, unknown> = {
      prompt,
      model: wireModel,
      duration,
      resolution: resolution.endsWith("P") ? resolution : `${resolution}P`,
    };
    if (imageUrls.length > 0) {
      body.first_frame_image = imageUrls[0];
    }

    return success({
      method: "POST",
      path: "/v1/video_generation",
      body,
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const taskId = typeof body.task_id === "string" ? body.task_id : undefined;
    if (!taskId) return failure(new ValidationError("MiniMax submit missing task_id"));
    return success({
      providerJobId: taskId,
      status: "pending",
      safeMetadata: { vendor: "minimax" },
    });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: "/v1/query/video_generation",
      query: { task_id: providerJobId },
    });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    const status = String(body.status ?? "");
    if (status === "Success") {
      const fileId = typeof body.file_id === "string" ? body.file_id : undefined;
      // MiniMax returns file_id — reconciler needs a temporary URL.
      // Protocol encodes a synthetic retrieve marker; leaf poll may need second hop.
      // For contract purity: store file_id in metadata and expose via temporaryUrl scheme
      // that MediaIngestion cannot fetch — so poll completion requires download_url.
      // Official flow: query → file_id → files/retrieve → download_url.
      // We encode providerJobId as task_id and expect caller/fake transport to complete
      // with download_url when Success includes it, or file retrieve in extended poll.
      const downloadUrl =
        typeof body.download_url === "string"
          ? body.download_url
          : typeof (body.file as { download_url?: string } | undefined)?.download_url === "string"
            ? (body.file as { download_url: string }).download_url
            : undefined;

      if (downloadUrl) {
        const outputs: ProviderOperationMediaOutput[] = [
          { index: 0, type: "video", mimeType: "video/mp4", temporaryUrl: downloadUrl },
        ];
        return success({
          status: "completed",
          outputs,
          safeMetadata: { vendorStatus: status, fileId },
        });
      }

      // Success without URL yet — keep pending with file_id so extended poll can retrieve
      if (fileId) {
        return success({
          status: "pending",
          nextPollAfterMs: 2000,
          safeMetadata: { vendorStatus: status, fileId, needsFileRetrieve: true },
        });
      }
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage: "MiniMax Success without file_id or download_url",
      });
    }
    if (status === "Fail") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          typeof body.error_message === "string" ? body.error_message : "MiniMax generation failed",
      });
    }
    return success({ status: "pending", nextPollAfterMs: 10_000 });
  }
}

/**
 * MiniMax file retrieve helper used by dispatcher when poll returns needsFileRetrieve.
 */
export function buildMinimaxFileRetrievePlan(fileId: string): VendorPollPlan {
  return {
    method: "GET",
    path: "/v1/files/retrieve",
    query: { file_id: fileId },
  };
}

export { WIRE_MODELS as MINIMAX_WIRE_MODELS };
