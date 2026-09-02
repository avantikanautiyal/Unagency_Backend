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

const WIRE_MODELS: Record<string, string> = {
  "hailuo-ai": "MiniMax-Hailuo-2.3",
  "MiniMax-Hailuo-2.3": "MiniMax-Hailuo-2.3",
  "minimax-hailuo-2.3": "MiniMax-Hailuo-2.3",
};

const MINIMAX_ASPECT_RATIOS = new Set([
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
]);

/** Map client aspect ratio to MiniMax-supported wire values. */
export function normalizeMinimaxAspectRatio(raw: unknown): string {
  const s =
    typeof raw === "string" && raw.trim()
      ? raw.trim().replace(/\s+/g, "")
      : "16:9";
  if (MINIMAX_ASPECT_RATIOS.has(s)) return s;
  if (/9:16|vertical|portrait|reel|story/i.test(s)) return "9:16";
  if (/1:1|square/i.test(s)) return "1:1";
  if (/4:3/i.test(s)) return "4:3";
  if (/3:4/i.test(s)) return "3:4";
  if (/21:9|ultra/i.test(s)) return "21:9";
  return "16:9";
}

/** MiniMax Hailuo 2.3 only accepts 6s or 10s duration. */
function normalizeMinimaxDuration(raw: unknown): 6 | 10 {
  let seconds = 6;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    seconds = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(String(raw).replace(/s$/i, "").trim());
    if (Number.isFinite(parsed)) seconds = parsed;
  }
  return seconds > 6 ? 10 : 6;
}

/** MiniMax video API prompt cap (Hailuo 2.3). */
export const MINIMAX_MAX_PROMPT_CHARS = 3000;

export function truncateMinimaxPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= MINIMAX_MAX_PROMPT_CHARS) return trimmed;
  const suffix = " …";
  const maxBody = MINIMAX_MAX_PROMPT_CHARS - suffix.length;
  const slice = trimmed.slice(0, maxBody);
  const lastBreak = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
  if (lastBreak > maxBody * 0.55) {
    return `${slice.slice(0, lastBreak + 1).trim()}${suffix}`;
  }
  return `${slice.trim()}${suffix}`;
}

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
    const promptRaw =
      typeof request.payload.prompt === "string" ? request.payload.prompt : undefined;
    if (!promptRaw?.trim()) {
      return failure(new ValidationError("prompt required for MiniMax video"));
    }
    const prompt = truncateMinimaxPrompt(promptRaw);

    const duration = normalizeMinimaxDuration(request.payload.duration);
    const aspectRatio = normalizeMinimaxAspectRatio(request.payload.aspectRatio);
    const resolution =
      typeof request.payload.resolution === "string"
        ? String(request.payload.resolution).toUpperCase().replace("P", "P")
        : "768P";

    const body: Record<string, unknown> = {
      prompt,
      model: wireModel,
      duration,
      aspect_ratio: aspectRatio,
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
    const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
    if (taskId) {
      return success({
        providerJobId: taskId,
        status: "pending",
        safeMetadata: { vendor: "minimax" },
      });
    }
    const baseResp =
      body.base_resp && typeof body.base_resp === "object"
        ? (body.base_resp as Record<string, unknown>)
        : undefined;
    const statusMsg =
      typeof baseResp?.status_msg === "string" ? baseResp.status_msg.trim() : "";
    return failure(
      new ValidationError(
        statusMsg
          ? `MiniMax video submit failed: ${statusMsg}`
          : "MiniMax submit missing task_id",
      ),
    );
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
