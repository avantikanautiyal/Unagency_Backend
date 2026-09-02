/**
 * PixVerse Platform API — verified from https://docs.platform.pixverse.ai/
 * Base: https://app-api.pixverse.ai
 * Auth: API-KEY + Ai-trace-id (UUID per unique request)
 * T2V: POST /openapi/v2/video/text/generate
 * I2V: POST /openapi/v2/image/upload → img_id → POST /openapi/v2/video/img/generate
 * Poll: GET /openapi/v2/video/result/{video_id}
 * Status: 1 = success, 5 = generating, 7 = moderation failed, 8 = generation failed
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
  "pixverse-v4": "v4",
  v4: "v4",
  v5: "v5",
  v6: "v6",
};

export const PIXVERSE_IMAGE_UPLOAD_PATH = "/openapi/v2/image/upload";
export const PIXVERSE_IMG_GENERATE_PATH = "/openapi/v2/video/img/generate";
export const PIXVERSE_TEXT_GENERATE_PATH = "/openapi/v2/video/text/generate";

export class PixverseVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "pixverse";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = true;

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix];
  }

  buildAuthHeaders(auth: VendorVideoAuthContext): Result<Readonly<Record<string, string>>> {
    if (!auth.apiKey?.trim()) return failure(new ValidationError("PIXVERSE_API_KEY required"));
    return success({
      "API-KEY": auth.apiKey,
      "Content-Type": "application/json",
    });
  }

  buildSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    imageUrls: readonly string[],
    idempotencyKey: string
  ): Result<VendorSubmitPlan> {
    if (imageUrls.length > 0) {
      // I2V requires upload hop first — PixverseI2vDispatcher handles this.
      // buildSubmit with images is reserved for T2V-only dispatcher path.
      return failure(
        new ValidationError(
          "PixVerse I2V requires image upload → img_id before generate (use Pixverse I2V leaf)"
        )
      );
    }
    return this.buildTextToVideoSubmit(request, wireModel, idempotencyKey);
  }

  buildTextToVideoSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    idempotencyKey: string
  ): Result<VendorSubmitPlan> {
    const common = this.commonBody(request, wireModel);
    if (!common.ok) return common;
    return success({
      method: "POST",
      path: PIXVERSE_TEXT_GENERATE_PATH,
      headers: { "Ai-trace-id": idempotencyKey },
      body: common.value,
    });
  }

  buildImageToVideoSubmit(
    request: ProviderExecutionRequest,
    wireModel: string,
    imgId: number,
    idempotencyKey: string
  ): Result<VendorSubmitPlan> {
    const common = this.commonBody(request, wireModel);
    if (!common.ok) return common;
    return success({
      method: "POST",
      path: PIXVERSE_IMG_GENERATE_PATH,
      headers: { "Ai-trace-id": idempotencyKey },
      body: {
        ...common.value,
        img_id: imgId,
        motion_mode: "normal",
      },
    });
  }

  parseUpload(body: Readonly<Record<string, unknown>>): Result<{ imgId: number }> {
    const errCode = body.ErrCode;
    if (errCode !== 0 && errCode !== undefined) {
      return failure(
        new ValidationError(
          typeof body.ErrMsg === "string" ? body.ErrMsg : `PixVerse upload ErrCode ${String(errCode)}`
        )
      );
    }
    const resp = body.Resp as Record<string, unknown> | undefined;
    const imgId = resp?.img_id;
    if (typeof imgId !== "number" && typeof imgId !== "string") {
      return failure(new ValidationError("PixVerse upload missing img_id"));
    }
    return success({ imgId: Number(imgId) });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const errCode = body.ErrCode;
    if (errCode !== 0 && errCode !== undefined) {
      return failure(
        new ValidationError(
          typeof body.ErrMsg === "string" ? body.ErrMsg : `PixVerse ErrCode ${String(errCode)}`
        )
      );
    }
    const resp = body.Resp as Record<string, unknown> | undefined;
    const videoId = resp?.video_id;
    if (videoId == null) return failure(new ValidationError("PixVerse submit missing video_id"));
    return success({
      providerJobId: String(videoId),
      status: "pending",
      safeMetadata: { vendor: "pixverse" },
    });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: `/openapi/v2/video/result/${encodeURIComponent(providerJobId)}`,
    });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    const errCode = body.ErrCode;
    if (errCode !== 0 && errCode !== undefined) {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage: typeof body.ErrMsg === "string" ? body.ErrMsg : "PixVerse error",
      });
    }
    const resp = (body.Resp ?? body) as Record<string, unknown>;
    const status = Number(resp.status);
    if (status === 1) {
      const url = typeof resp.url === "string" ? resp.url : undefined;
      const outputs: ProviderOperationMediaOutput[] = url
        ? [
            {
              index: 0,
              type: "video",
              mimeType: "video/mp4",
              temporaryUrl: url,
              metadata: {
                ...(typeof resp.outputWidth === "number" ? { width: resp.outputWidth } : {}),
                ...(typeof resp.outputHeight === "number" ? { height: resp.outputHeight } : {}),
              },
            },
          ]
        : [];
      return success({ status: "completed", outputs, safeMetadata: { vendorStatus: status } });
    }
    if (status === 7 || status === 8 || status === 6) {
      return success({
        status: "failed",
        errorCode: status === 7 ? "content_policy" : "provider_failed",
        errorMessage: `PixVerse status ${status}`,
      });
    }
    return success({ status: "pending", nextPollAfterMs: 5000 });
  }

  private commonBody(
    request: ProviderExecutionRequest,
    wireModel: string
  ): Result<Record<string, unknown>> {
    const prompt =
      typeof request.payload.prompt === "string" ? request.payload.prompt : undefined;
    if (!prompt) return failure(new ValidationError("prompt required for PixVerse video"));

    const duration =
      typeof request.payload.duration === "number" ? request.payload.duration : 5;
    const aspectRatio =
      typeof request.payload.aspectRatio === "string" ? request.payload.aspectRatio : "16:9";
    const quality =
      typeof request.payload.resolution === "string"
        ? String(request.payload.resolution).toLowerCase()
        : "540p";

    return success({
      aspect_ratio: aspectRatio,
      duration,
      model: wireModel,
      prompt,
      quality,
      seed: typeof request.payload.seed === "number" ? request.payload.seed : 0,
      ...(typeof request.payload.negativePrompt === "string"
        ? { negative_prompt: request.payload.negativePrompt }
        : {}),
    });
  }
}

export { WIRE_MODELS as PIXVERSE_WIRE_MODELS };
