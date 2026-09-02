/**
 * Seedance 2.0 via WaveSpeed AI (API keys use wsk_live_… prefix).
 * Submit: POST /api/v3/bytedance/seedance-2.0/text-to-video
 * Poll:   GET  /api/v3/predictions/{id}/result
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
  "seedance-2": "bytedance/seedance-2.0/text-to-video",
  "seedance-2.0": "bytedance/seedance-2.0/text-to-video",
  "seedance-2-i2v": "bytedance/seedance-2.0/image-to-video",
};

function unwrapData(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return body as Record<string, unknown>;
}

export class SeedanceVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "seedance";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = false;

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix] ?? WIRE_MODELS["seedance-2"];
  }

  buildAuthHeaders(
    auth: VendorVideoAuthContext
  ): Result<Readonly<Record<string, string>>> {
    if (!auth.apiKey?.trim()) {
      return failure(new ValidationError("SEEDANCE_API_KEY required"));
    }
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
      typeof request.payload.prompt === "string"
        ? request.payload.prompt
        : undefined;
    if (!prompt) {
      return failure(new ValidationError("prompt required for Seedance video"));
    }

    const durationRaw = request.payload.duration;
    let duration =
      typeof durationRaw === "number"
        ? durationRaw
        : typeof durationRaw === "string"
          ? Number(durationRaw.replace(/s$/i, ""))
          : 5;
    if (!Number.isFinite(duration)) duration = 5;
    duration = Math.max(4, Math.min(15, Math.round(duration)));

    const aspectRatio =
      typeof request.payload.aspectRatio === "string"
        ? request.payload.aspectRatio
        : "16:9";

    const path = imageUrls.length > 0
      ? "/api/v3/bytedance/seedance-2.0/image-to-video"
      : `/api/v3/${wireModel.replace(/^bytedance\//, "bytedance/")}`;

    // Normalize path — wireModel is already "bytedance/seedance-2.0/text-to-video"
    const submitPath = imageUrls.length > 0
      ? "/api/v3/bytedance/seedance-2.0/image-to-video"
      : `/api/v3/${wireModel}`;

    const body: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution: "720p",
      duration,
      generate_audio: true,
    };
    if (imageUrls.length > 0) {
      body.reference_images = imageUrls.slice(0, 9);
    }

    void path;
    return success({
      method: "POST",
      path: submitPath,
      body,
    });
  }

  parseSubmit(
    body: Readonly<Record<string, unknown>>
  ): Result<ProviderAsyncSubmitResult> {
    const data = unwrapData(body);
    const id = typeof data.id === "string" ? data.id : undefined;
    if (!id) {
      return failure(new ValidationError("Seedance submit missing prediction id"));
    }
    return success({
      providerJobId: id,
      status: "pending",
      safeMetadata: { vendor: "seedance" },
    });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: `/api/v3/predictions/${encodeURIComponent(providerJobId)}/result`,
    });
  }

  parsePoll(
    body: Readonly<Record<string, unknown>>
  ): Result<ProviderAsyncPollResult> {
    const data = unwrapData(body);
    const status = String(data.status ?? "").toLowerCase();

    if (status === "completed") {
      const outputs = normalizeOutputs(data.outputs);
      return success({
        status: "completed",
        outputs,
        safeMetadata: { vendorStatus: status },
      });
    }
    if (status === "failed" || status === "cancelled" || status === "timeout") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : `Seedance task ${status}`,
      });
    }
    return success({ status: "pending", nextPollAfterMs: 2500 });
  }
}

function normalizeOutputs(raw: unknown): readonly ProviderOperationMediaOutput[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderOperationMediaOutput[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (typeof item === "string" && /^https?:\/\//i.test(item)) {
      out.push({
        index,
        type: "video",
        mimeType: "video/mp4",
        temporaryUrl: item,
      });
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const url =
        typeof rec.url === "string"
          ? rec.url
          : typeof rec.video === "string"
            ? rec.video
            : undefined;
      if (url && /^https?:\/\//i.test(url)) {
        out.push({
          index,
          type: "video",
          mimeType: "video/mp4",
          temporaryUrl: url,
        });
      }
    }
  }
  return out;
}
