/**
 * Higgsfield platform API — https://docs.higgsfield.ai/docs/models/kling-3.md
 * Base: https://api.higgsfield.ai
 * Auth: Authorization: Key {key_id}:{key_secret}
 * Submit: POST /kling-video/v3.0-turbo/{text-to-video|image-to-video}
 * Poll: GET /requests/{id}/status
 * States: queued | in_progress | completed | failed | nsfw | canceled
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
} from "../../async/contracts/provider-operation";
import type {
  IVendorVideoProtocol,
  VendorPollPlan,
  VendorSubmitPlan,
  VendorVideoAuthContext,
} from "../common/vendor-video-protocol";
import { truncateVideoPrompt } from "../common/video-prompt-limits";

/** Inventory ids map to the endpoint prefix; the workflow suffix depends on image input. */
const WIRE_MODELS: Record<string, string> = {
  "higgsfield-video": "kling-video/v3.0-turbo",
};

/** Text-to-video only; image-to-video takes its shape from the input image. */
const ASPECT_RATIOS: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "1:1": "1:1",
  "4:5": "1:1",
  "3:4": "9:16",
  "4:3": "16:9",
  "21:9": "16:9",
};

function normalizeDuration(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace(/s$/i, ""))
        : 5;
  if (!Number.isFinite(n)) return 5;
  return Math.min(15, Math.max(3, Math.round(n)));
}

/** Unset requests render at 1080p, the same default as Luma. */
function normalizeResolution(raw: unknown): "720p" | "1080p" {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  return s.includes("720") ? "720p" : "1080p";
}

export class HiggsfieldVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "higgsfield";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = true;
  readonly requiresHttpImageInputs = true;

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix];
  }

  buildAuthHeaders(auth: VendorVideoAuthContext): Result<Readonly<Record<string, string>>> {
    if (!auth.accessKey?.trim() || !auth.secretKey?.trim()) {
      return failure(new ValidationError("HIGGSFIELD_API_KEY and HIGGSFIELD_API_KEY_SECRET required"));
    }
    return success({
      Authorization: `Key ${auth.accessKey}:${auth.secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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
    if (!promptRaw?.trim()) {
      return failure(new ValidationError("prompt required for Higgsfield video"));
    }

    const body: Record<string, unknown> = {
      prompt: truncateVideoPrompt(promptRaw, "higgsfield"),
      duration: normalizeDuration(request.payload.duration),
      resolution: normalizeResolution(request.payload.resolution),
    };

    // This model has no end-frame field, so only the opening frame is sent.
    const startFrame = imageUrls.find((u) => /^https?:\/\//i.test(u));
    if (startFrame) {
      body.image_url = startFrame;
    } else {
      const ratio =
        typeof request.payload.aspectRatio === "string"
          ? request.payload.aspectRatio.trim()
          : "";
      body.aspect_ratio = ASPECT_RATIOS[ratio] ?? "16:9";
    }

    return success({
      method: "POST",
      path: `/${wireModel}/${startFrame ? "image-to-video" : "text-to-video"}`,
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const id = typeof body.request_id === "string" ? body.request_id : undefined;
    if (!id) return failure(new ValidationError("Higgsfield submit missing request_id"));
    return success({
      providerJobId: id,
      status: "pending",
      safeMetadata: { vendor: "higgsfield" },
    });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: `/requests/${encodeURIComponent(providerJobId)}/status`,
    });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    const status = String(body.status ?? "").toLowerCase();
    if (status === "completed") {
      const video = body.video as Record<string, unknown> | undefined;
      const temporaryUrl = typeof video?.url === "string" ? video.url : undefined;
      if (!temporaryUrl) {
        return success({
          status: "failed",
          errorCode: "provider_failed",
          errorMessage: "Higgsfield request completed without a video URL",
        });
      }
      return success({
        status: "completed",
        outputs: [{ index: 0, type: "video", mimeType: "video/mp4", temporaryUrl }],
        safeMetadata: { vendorStatus: status },
      });
    }
    if (status === "failed" || status === "nsfw" || status === "canceled") {
      const reason = typeof body.error === "string" && body.error.trim() ? body.error : undefined;
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          reason ??
          (status === "nsfw"
            ? "Higgsfield content moderation rejected the request"
            : `Higgsfield request ${status}`),
      });
    }
    return success({ status: "pending", nextPollAfterMs: 5000 });
  }
}
