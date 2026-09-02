/**
 * Luma Agents API — https://docs.agents.lumalabs.ai/guides/video-generation
 * Base: https://agents.lumalabs.ai
 * Auth: Bearer (luma-api-* keys from platform.lumalabs.ai)
 * Submit: POST /v1/generations
 * Poll: GET /v1/generations/{id}
 * Model: ray-3.2
 * States: queued | dreaming | completed | failed
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

/** Inventory ids map to the current Agents API video model. */
const WIRE_MODELS: Record<string, string> = {
  "luma-ray-2": "ray-3.2",
  "ray-2": "ray-3.2",
  "ray-flash-2": "ray-3.2",
  "ray-3.2": "ray-3.2",
};

const LUMA_ASPECT_RATIOS = new Set(["9:16", "3:4", "1:1", "4:3", "16:9", "21:9"]);

function normalizeLumaAspectRatio(raw: unknown): string | undefined {
  const s =
    typeof raw === "string" && raw.trim()
      ? raw.trim().replace(/\s+/g, "")
      : undefined;
  if (!s) return undefined;
  if (LUMA_ASPECT_RATIOS.has(s)) return s;
  if (/9:16|vertical|portrait|reel|story/i.test(s)) return "9:16";
  if (/1:1|square/i.test(s)) return "1:1";
  if (/4:3/i.test(s)) return "4:3";
  if (/3:4/i.test(s)) return "3:4";
  if (/21:9|ultra/i.test(s)) return "21:9";
  return "16:9";
}

function normalizeLumaDuration(raw: unknown): "5s" | "10s" {
  let seconds = 5;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    seconds = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(String(raw).replace(/s$/i, "").trim());
    if (Number.isFinite(parsed)) seconds = parsed;
  }
  return seconds > 6 ? "10s" : "5s";
}

function normalizeLumaResolution(raw: unknown): string {
  const s =
    typeof raw === "string" && raw.trim()
      ? raw.trim().toLowerCase().replace(/\s+/g, "")
      : "720p";
  if (["360p", "540p", "720p", "1080p"].includes(s)) return s;
  if (s.includes("1080")) return "1080p";
  if (s.includes("540")) return "540p";
  if (s.includes("360")) return "360p";
  return "720p";
}

function imageRefFromUrl(url: string): Record<string, string> | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }
  const dataMatch = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (dataMatch) {
    return {
      media_type: dataMatch[1] || "image/png",
      data: dataMatch[2] || "",
    };
  }
  return undefined;
}

export class LumaVideoProtocol implements IVendorVideoProtocol {
  readonly vendorId = "luma";
  readonly verified = true as const;
  readonly supportsCancellation = false;
  readonly supportsIdempotencyHeader = false;

  resolveWireModel(canonicalModelId: string): string | undefined {
    const suffix = canonicalModelId.includes("/")
      ? canonicalModelId.split("/").pop()!
      : canonicalModelId;
    return WIRE_MODELS[suffix] ?? WIRE_MODELS[canonicalModelId];
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
    const promptRaw =
      typeof request.payload.prompt === "string" ? request.payload.prompt : undefined;
    if (!promptRaw) return failure(new ValidationError("prompt required for Luma video"));
    const prompt = truncateVideoPrompt(promptRaw, "luma");

    const duration = normalizeLumaDuration(request.payload.duration);
    const video: Record<string, unknown> = {
      resolution: normalizeLumaResolution(request.payload.resolution),
      duration,
    };

    const startFrameUrl = imageUrls.map(imageRefFromUrl).find(Boolean);
    if (startFrameUrl && duration === "5s") {
      video.start_frame = startFrameUrl;
    }

    const body: Record<string, unknown> = {
      model: wireModel,
      type: "video",
      prompt,
      video,
    };

    const aspectRatio = normalizeLumaAspectRatio(request.payload.aspectRatio);
    if (aspectRatio) {
      body.aspect_ratio = aspectRatio;
    }

    return success({
      method: "POST",
      path: "/v1/generations",
      body,
    });
  }

  parseSubmit(body: Readonly<Record<string, unknown>>): Result<ProviderAsyncSubmitResult> {
    const id = typeof body.id === "string" ? body.id : undefined;
    if (!id) return failure(new ValidationError("Luma submit missing generation id"));
    const state = String(body.state ?? "queued").toLowerCase();
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
      path: `/v1/generations/${encodeURIComponent(providerJobId)}`,
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
          typeof body.failure_reason === "string"
            ? body.failure_reason
            : "Luma generation failed",
      });
    }
    return success({ status: "pending", nextPollAfterMs: 5000 });
  }
}

function extractLumaOutputs(
  body: Readonly<Record<string, unknown>>
): readonly ProviderOperationMediaOutput[] {
  const output = Array.isArray(body.output) ? body.output : [];
  const urls: ProviderOperationMediaOutput[] = [];
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const type = typeof rec.type === "string" ? rec.type : "video";
    if (type !== "video") continue;
    const temporaryUrl = typeof rec.url === "string" ? rec.url : undefined;
    if (!temporaryUrl) continue;
    urls.push({ index, type: "video", mimeType: "video/mp4", temporaryUrl });
  }

  if (urls.length > 0) return urls;

  // Legacy Dream Machine shape (assets.video) — keep for in-flight ops.
  const assets = body.assets as Record<string, unknown> | undefined;
  const legacyUrl = typeof assets?.video === "string" ? assets.video : undefined;
  if (legacyUrl) {
    return [{ index: 0, type: "video", mimeType: "video/mp4", temporaryUrl: legacyUrl }];
  }

  return [];
}

export { WIRE_MODELS as LUMA_WIRE_MODELS };
