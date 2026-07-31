/**
 * Runway ML Dev API — verified from https://docs.dev.runwayml.com/
 * Auth: Bearer + X-Runway-Version: 2024-11-06
 * Submit: POST /v1/text_to_video | POST /v1/image_to_video
 * Poll: GET /v1/tasks/{id}
 * Status: PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED | THROTTLED
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
  VendorCancelPlan,
  VendorPollPlan,
  VendorSubmitPlan,
  VendorVideoAuthContext,
} from "../common/vendor-video-protocol";

const RUNWAY_VERSION = "2024-11-06";

/** Canonical inventory suffix → verified Runway wire model */
const WIRE_MODELS: Record<string, string> = {
  "runway-gen-4": "gen4.5",
  "gen4.5": "gen4.5",
  gen4_turbo: "gen4_turbo",
};

export class RunwayVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "runway";
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
    if (!auth.apiKey?.trim()) {
      return failure(new ValidationError("RUNWAY_API_KEY required"));
    }
    return success({
      Authorization: `Bearer ${auth.apiKey}`,
      "X-Runway-Version": RUNWAY_VERSION,
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
    if (!prompt) return failure(new ValidationError("prompt required for Runway video"));

    const durationRaw = request.payload.duration;
    const duration =
      typeof durationRaw === "number"
        ? durationRaw
        : typeof durationRaw === "string"
          ? Number(durationRaw.replace(/s$/i, ""))
          : 5;

    const ratio =
      typeof request.payload.aspectRatio === "string"
        ? mapAspectToRunwayRatio(request.payload.aspectRatio)
        : "1280:720";

    if (imageUrls.length > 0) {
      return success({
        method: "POST",
        path: "/v1/image_to_video",
        body: {
          model: wireModel,
          promptImage: imageUrls[0],
          promptText: prompt,
          ratio,
          duration: Number.isFinite(duration) ? duration : 5,
        },
      });
    }

    return success({
      method: "POST",
      path: "/v1/text_to_video",
      body: {
        model: wireModel,
        promptText: prompt,
        ratio,
        duration: Number.isFinite(duration) ? duration : 5,
      },
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const id = typeof body.id === "string" ? body.id : undefined;
    if (!id) return failure(new ValidationError("Runway submit missing task id"));
    return success({ providerJobId: id, status: "pending", safeMetadata: { vendor: "runway" } });
  }

  buildPoll(providerJobId: string): Result<VendorPollPlan> {
    return success({
      method: "GET",
      path: `/v1/tasks/${encodeURIComponent(providerJobId)}`,
    });
  }

  parsePoll(
    body: Readonly<Record<string, unknown>>,
    headers: Readonly<Record<string, string>>
  ): Result<ProviderAsyncPollResult> {
    const status = String(body.status ?? "").toUpperCase();
    const retryAfter = headers["retry-after"];
    const nextPollAfterMs = retryAfter ? Number(retryAfter) * 1000 : 5000;

    if (status === "SUCCEEDED") {
      const outputs = normalizeRunwayOutputs(body.output);
      return success({
        status: "completed",
        outputs,
        usage: undefined,
        safeMetadata: { vendorStatus: status },
      });
    }
    if (status === "FAILED") {
      return success({
        status: "failed",
        errorCode: "provider_failed",
        errorMessage: typeof body.failure === "string" ? body.failure : "Runway task failed",
      });
    }
    if (status === "CANCELLED" || status === "CANCELED") {
      return success({ status: "cancelled" });
    }
    if (status === "THROTTLED") {
      return success({ status: "pending", nextPollAfterMs: nextPollAfterMs || 10_000 });
    }
    return success({ status: "pending", nextPollAfterMs });
  }
}

function mapAspectToRunwayRatio(aspect: string): string {
  const a = aspect.trim();
  if (a.includes(":")) {
    if (a === "16:9") return "1280:720";
    if (a === "9:16") return "720:1280";
    if (a === "1:1") return "960:960";
  }
  if (/^\d+:\d+$/.test(a) && a.includes("1280")) return a;
  return a.includes("x") ? a.replace("x", ":") : "1280:720";
}

function normalizeRunwayOutputs(raw: unknown): readonly ProviderOperationMediaOutput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const url = typeof item === "string" ? item : undefined;
    return {
      index,
      type: "video" as const,
      mimeType: "video/mp4",
      temporaryUrl: url,
    };
  });
}

export { WIRE_MODELS as RUNWAY_WIRE_MODELS };
