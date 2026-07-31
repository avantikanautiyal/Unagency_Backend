/**
 * Luma Dream Machine API — verified from https://docs.lumalabs.ai/docs/video-generation
 * Base: https://api.lumalabs.ai
 * Auth: Bearer
 * Submit: POST /dream-machine/v1/generations
 * Poll: GET /dream-machine/v1/generations/{id}
 * States: dreaming | completed | failed
 * Models: ray-2, ray-flash-2
 * Cancel: DELETE generation (delete, not in-flight cancel) — supportsCancellation=false
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
  "luma-ray-2": "ray-2",
  "ray-2": "ray-2",
  "ray-flash-2": "ray-flash-2",
};

export class LumaVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "luma";
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
    if (!auth.apiKey?.trim()) return failure(new ValidationError("LUMA_API_KEY required"));
    return success({
      Authorization: `Bearer ${auth.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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
    if (!prompt) return failure(new ValidationError("prompt required for Luma video"));

    const body: Record<string, unknown> = {
      prompt,
      model: wireModel,
    };

    if (typeof request.payload.aspectRatio === "string") {
      body.aspect_ratio = request.payload.aspectRatio;
    }
    if (typeof request.payload.resolution === "string") {
      body.resolution = String(request.payload.resolution).toLowerCase();
    }
    if (request.payload.duration != null) {
      const d = request.payload.duration;
      body.duration = typeof d === "number" ? `${d}s` : String(d);
    }
    if (imageUrls.length > 0) {
      body.keyframes = {
        frame0: { type: "image", url: imageUrls[0] },
      };
    }

    return success({
      method: "POST",
      path: "/dream-machine/v1/generations",
      body,
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const id = typeof body.id === "string" ? body.id : undefined;
    if (!id) return failure(new ValidationError("Luma submit missing generation id"));
    const state = String(body.state ?? "dreaming").toLowerCase();
    if (state === "completed") {
      return success({
        providerJobId: id,
        status: "completed",
        outputs: extractLumaOutputs(body),
      });
    }
    return success({ providerJobId: id, status: "pending", safeMetadata: { vendor: "luma" } });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: `/dream-machine/v1/generations/${encodeURIComponent(providerJobId)}`,
    });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    const state = String(body.state ?? "").toLowerCase();
    if (state === "completed") {
      return success({
        status: "completed",
        outputs: extractLumaOutputs(body),
        safeMetadata: { vendorStatus: state },
      });
    }
    if (state === "failed") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          typeof body.failure_reason === "string" ? body.failure_reason : "Luma generation failed",
      });
    }
    return success({ status: "pending", nextPollAfterMs: 3000 });
  }
}

function extractLumaOutputs(body: Readonly<Record<string, unknown>>): readonly ProviderOperationMediaOutput[] {
  const assets = body.assets as Record<string, unknown> | undefined;
  const videoUrl = typeof assets?.video === "string" ? assets.video : undefined;
  if (!videoUrl) return [];
  return [{ index: 0, type: "video", mimeType: "video/mp4", temporaryUrl: videoUrl }];
}

export { WIRE_MODELS as LUMA_WIRE_MODELS };
