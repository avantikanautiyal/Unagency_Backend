/**
 * Google Veo via Gemini API — verified from https://ai.google.dev/gemini-api/docs/video
 * Base: https://generativelanguage.googleapis.com
 * Auth: x-goog-api-key
 * Submit: POST /v1beta/models/{model}:predictLongRunning
 * Poll: GET /v1beta/{operation.name}
 * Model: veo-3.1-generate-preview (maps inventory google/veo-3)
 * Provider identity: provider.google (catalog) — distinct from provider.gemini text leaf
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
  "veo-3": "veo-3.1-generate-preview",
  "veo-3.1-generate-preview": "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview": "veo-3.1-fast-generate-preview",
};

export class GoogleVeoVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "google";
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
    const key = auth.apiKey?.trim();
    if (!key) return failure(new ValidationError("GOOGLE_API_KEY (or GEMINI_API_KEY) required for Veo"));
    return success({
      "x-goog-api-key": key,
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
    if (!prompt) return failure(new ValidationError("prompt required for Google Veo"));

    const instance: Record<string, unknown> = { prompt };
    if (imageUrls.length > 0) {
      // Gemini Veo image input via instances[].image (URI) when supported
      instance.image = { uri: imageUrls[0] };
    }

    const parameters: Record<string, unknown> = {};
    if (typeof request.payload.aspectRatio === "string") {
      parameters.aspectRatio = request.payload.aspectRatio;
    }
    if (request.payload.duration != null) {
      const d =
        typeof request.payload.duration === "number"
          ? request.payload.duration
          : Number(String(request.payload.duration).replace(/s$/i, ""));
      if (Number.isFinite(d)) parameters.durationSeconds = d;
    }
    if (typeof request.payload.negativePrompt === "string") {
      parameters.negativePrompt = request.payload.negativePrompt;
    }
    if (typeof request.payload.resolution === "string") {
      parameters.resolution = request.payload.resolution;
    }

    return success({
      method: "POST",
      path: `/v1beta/models/${encodeURIComponent(wireModel)}:predictLongRunning`,
      body: {
        instances: [instance],
        ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
      },
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const name = typeof body.name === "string" ? body.name : undefined;
    if (!name) return failure(new ValidationError("Google Veo submit missing operation name"));
    if (body.done === true) {
      return success({
        providerJobId: name,
        status: "completed",
        outputs: extractVeoOutputs(body),
      });
    }
    return success({
      providerJobId: name,
      status: "pending",
      safeMetadata: { vendor: "google-veo" },
    });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    const path = providerJobId.startsWith("operations/")
      ? `/v1beta/${providerJobId}`
      : `/v1beta/operations/${encodeURIComponent(providerJobId)}`;
    return success({ method: "GET", path });
  }

  parsePoll(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncPollResult> {
    if (body.done === true) {
      if (body.error && typeof body.error === "object") {
        const err = body.error as Record<string, unknown>;
        return success({
          status: "failed",
          errorCode: "provider_failed",
          errorMessage: typeof err.message === "string" ? err.message : "Veo operation failed",
        });
      }
      return success({
        status: "completed",
        outputs: extractVeoOutputs(body),
        safeMetadata: { vendorStatus: "done" },
      });
    }
    return success({ status: "pending", nextPollAfterMs: 10_000 });
  }
}

function extractVeoOutputs(body: Readonly<Record<string, unknown>>): readonly ProviderOperationMediaOutput[] {
  const response = (body.response ?? body) as Record<string, unknown>;
  const generateVideoResponse =
    (response.generateVideoResponse as Record<string, unknown> | undefined) ??
    (response.generateVideoResponse as undefined);
  const samples =
    (generateVideoResponse?.generatedSamples as unknown[]) ??
    ((response as { generated_videos?: unknown[] }).generated_videos as unknown[]) ??
    [];

  if (!Array.isArray(samples) || samples.length === 0) {
    // Alternate shape from some SDK responses
    const uri =
      typeof (response as { video?: { uri?: string } }).video?.uri === "string"
        ? (response as { video: { uri: string } }).video.uri
        : undefined;
    if (uri) {
      return [{ index: 0, type: "video", mimeType: "video/mp4", temporaryUrl: uri }];
    }
    return [];
  }

  return samples.map((sample, index) => {
    const rec = sample as Record<string, unknown>;
    const video = rec.video as Record<string, unknown> | undefined;
    const uri =
      typeof video?.uri === "string"
        ? video.uri
        : typeof rec.uri === "string"
          ? rec.uri
          : undefined;
    return {
      index,
      type: "video" as const,
      mimeType: "video/mp4",
      temporaryUrl: uri,
    };
  });
}

export { WIRE_MODELS as GOOGLE_VEO_WIRE_MODELS };
