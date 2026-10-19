/**
 * Seedance 2.0 via seedanceapi.org (v2). Docs: https://seedanceapi.org/docs/v2
 * Submit: POST /v2/generate
 * Poll:   GET  /v2/status?task_id={id}
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
  "seedance-2": "seedance-2.0",
  "seedance-2.0": "seedance-2.0",
  "seedance-2-i2v": "seedance-2.0",
  "seedance-2.0-fast": "seedance-2.0-fast",
};

const PROMPT_MAX_CHARS = 2000;
const ALLOWED_DURATIONS = [5, 10, 15] as const;
/** 2.0 accepts only these ratios; other ratios map to the closest shape. */
const ASPECT_RATIOS: Record<string, string> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "1:1": "3:4",
  "4:5": "3:4",
  "21:9": "16:9",
};

function unwrapData(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const data = body.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return body as Record<string, unknown>;
}

function snapDuration(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw.replace(/s$/i, ""))
        : 5;
  if (!Number.isFinite(n)) return 5;
  return ALLOWED_DURATIONS.reduce((best, d) =>
    Math.abs(d - n) < Math.abs(best - n) ? d : best,
  );
}

export class SeedanceVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "seedance";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = false;
  readonly requiresHttpImageInputs = true;

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
        ? request.payload.prompt.trim()
        : "";
    if (!prompt) {
      return failure(new ValidationError("prompt required for Seedance video"));
    }

    const requestedRatio =
      typeof request.payload.aspectRatio === "string"
        ? request.payload.aspectRatio.trim()
        : "16:9";

    const body: Record<string, unknown> = {
      prompt: prompt.slice(0, PROMPT_MAX_CHARS),
      model: wireModel,
      duration: snapDuration(request.payload.duration),
      resolution: "720p",
      aspect_ratio: ASPECT_RATIOS[requestedRatio] ?? "16:9",
    };
    // Only http(s) URLs are accepted. A second image is read as the END frame,
    // so it is sent only when the shot plan deliberately attached one.
    const urls = imageUrls.filter((u) => /^https?:\/\//i.test(u));
    if (urls.length) {
      body.images =
        request.payload.videoUseEndFrame === true && urls.length >= 2
          ? urls.slice(0, 2)
          : [urls[0]];
    }

    return success({ method: "POST", path: "/v2/generate", body });
  }

  parseSubmit(
    body: Readonly<Record<string, unknown>>
  ): Result<ProviderAsyncSubmitResult> {
    const data = unwrapData(body);
    const id = typeof data.task_id === "string" ? data.task_id : undefined;
    if (!id) {
      const msg =
        typeof body.message === "string" && body.message.trim()
          ? `: ${body.message}`
          : "";
      return failure(new ValidationError(`Seedance submit missing task_id${msg}`));
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
      path: `/v2/status?task_id=${encodeURIComponent(providerJobId)}`,
    });
  }

  parsePoll(
    body: Readonly<Record<string, unknown>>
  ): Result<ProviderAsyncPollResult> {
    const data = unwrapData(body);
    const status = String(data.status ?? "").toUpperCase();

    if (status === "SUCCESS") {
      const outputs = normalizeOutputs(data.response);
      if (outputs.length === 0) {
        return success({
          status: "failed",
          errorCode: "provider_failed",
          errorMessage: "Seedance task succeeded without a video URL",
        });
      }
      return success({
        status: "completed",
        outputs,
        safeMetadata: { vendorStatus: status },
      });
    }
    if (status === "FAILED") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage:
          typeof data.error_message === "string" && data.error_message.trim()
            ? data.error_message
            : "Seedance task failed",
      });
    }
    return success({ status: "pending", nextPollAfterMs: 5000 });
  }
}

function normalizeOutputs(raw: unknown): readonly ProviderOperationMediaOutput[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const out: ProviderOperationMediaOutput[] = [];
  list.forEach((item, index) => {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) {
      out.push({ index, type: "video", mimeType: "video/mp4", temporaryUrl: item });
    }
  });
  return out;
}
