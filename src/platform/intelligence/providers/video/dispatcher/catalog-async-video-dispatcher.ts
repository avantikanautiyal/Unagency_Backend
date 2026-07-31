/**
 * Catalog-backed async video provider leaf — IAsyncProviderDispatcher.
 * Maps canonical requests to UNAGENCY async video contract (certification) or verified vendor API.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import { asProviderId, type ProviderId } from "../../../shared/identifiers";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type {
  IAsyncProviderDispatcher,
  ProviderExecutionSemantics,
} from "../../async/interfaces/async-provider-dispatcher";
import type {
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
  ProviderOperationMediaOutput,
} from "../../async/contracts/provider-operation";
import type { VideoProviderConfig } from "../contracts/video-provider-config";
import {
  cancelPathForJob,
  pollPathForJob,
} from "../contracts/unagency-async-video-contract";
import type { IVideoHttpClient } from "../http/video-http-client";
import type { BlobAccessService } from "../../../../media/blob/blob-access-service";
import { extractInputAssets } from "../../common/input-asset-validator";
import { isVideoGenerationCapability } from "../../common/resolve-execution-modality";

export class CatalogAsyncVideoDispatcher implements IAsyncProviderDispatcher {
  constructor(
    private readonly config: VideoProviderConfig,
    private readonly http: IVideoHttpClient,
    private readonly blobAccess?: BlobAccessService,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  executionSemantics(): ProviderExecutionSemantics {
    return "async";
  }

  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }

  supportsCancellation(_providerId: ProviderId): boolean {
    return this.config.supportsCancellation;
  }

  async dispatch(
    _request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    return failure(new ValidationError("Video providers are async-only"));
  }

  async submitAsync(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
    idempotencyKey: string
  ): Promise<Result<ProviderAsyncSubmitResult>> {
    const enforcement = this.enforceModelCapability(request);
    if (!enforcement.ok) return enforcement;

    const body = await this.buildSubmitBody(request);
    if (!body.ok) return body;

    const contract = this.config.contract;
    const response = await this.http.send({
      method: contract.submitMethod,
      path: contract.submitPath,
      body: body.value,
      headers: {
        [contract.idempotencyHeader]: idempotencyKey,
      },
      timeoutMs: 120_000,
    });
    if (!response.ok) return response;

    const parsed = this.parseSubmitResponse(response.value.body);
    if (!parsed.ok) return parsed;
    return success(parsed.value);
  }

  async pollAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>> {
    const enforcement = this.enforceModelCapability(request);
    if (!enforcement.ok) return enforcement;

    const contract = this.config.contract;
    const response = await this.http.send({
      method: contract.pollMethod,
      path: pollPathForJob(contract, providerJobId),
      timeoutMs: 60_000,
    });
    if (!response.ok) return response;

    const retryAfter = response.value.headers["retry-after"];
    const nextPollAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return this.parsePollResponse(response.value.body, nextPollAfterMs);
  }

  async cancelAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<void>> {
    if (!this.config.supportsCancellation) {
      return failure(new ValidationError("Provider does not support cancellation"));
    }
    const enforcement = this.enforceModelCapability(request);
    if (!enforcement.ok) return enforcement;

    const response = await this.http.send({
      method: this.config.contract.cancelMethod,
      path: cancelPathForJob(this.config.contract, providerJobId),
      timeoutMs: 30_000,
    });
    if (!response.ok) return response;
    return success(undefined);
  }

  private enforceModelCapability(request: ProviderExecutionRequest): Result<void> {
    const cap = String(request.capabilityId);
    if (!isVideoGenerationCapability(cap)) {
      return failure(new ValidationError(`Capability ${cap} is not a video generation capability`));
    }
    if (String(request.providerId) !== this.config.canonicalProviderId) {
      return failure(
        new ValidationError(
          `Model/provider mismatch: dispatcher is ${this.config.canonicalProviderId}, request is ${request.providerId}`
        )
      );
    }
    const modelId = request.modelId;
    if (!modelId) {
      return failure(new ValidationError("modelId is required for video generation"));
    }
    const wire = this.resolveWireModel(modelId);
    if (!wire) {
      return failure(new ValidationError(`Model ${modelId} is not executable on ${this.config.canonicalProviderId}`));
    }
    return success(undefined);
  }

  private resolveWireModel(modelId: string) {
    const normalized = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
    return this.config.wireModels.find(
      (m) =>
        m.inventoryModelId === normalized ||
        `${this.config.vendor}/${m.inventoryModelId}` === modelId ||
        modelId.endsWith(`/${m.inventoryModelId}`)
    );
  }

  private async buildSubmitBody(
    request: ProviderExecutionRequest
  ): Promise<Result<Record<string, unknown>>> {
    const payload = request.payload;
    const wire = this.resolveWireModel(request.modelId!);
    if (!wire) {
      return failure(new ValidationError(`Unknown model ${request.modelId}`));
    }

    const body: Record<string, unknown> = {
      model: wire.wireModelId,
      prompt: typeof payload.prompt === "string" ? payload.prompt : undefined,
      negativePrompt:
        typeof payload.negativePrompt === "string" ? payload.negativePrompt : undefined,
      duration: payload.duration,
      aspectRatio: payload.aspectRatio,
      resolution: payload.resolution,
      fps: payload.fps,
      seed: payload.seed,
      options: request.options,
    };

    const assets = extractInputAssets(payload);
    if (assets.length > 0) {
      if (!wire.supportsImageToVideo) {
        return failure(new ValidationError("Model does not support image-to-video"));
      }
      const imageInputs: string[] = [];
      for (const asset of assets) {
        if (asset.storageRef && this.blobAccess) {
          const signed = await this.blobAccess.createProviderInputSignedUrl(
            asset.storageRef,
            String(request.context.organizationId)
          );
          if (!signed.ok) return signed;
          imageInputs.push(signed.value.signedUrl);
        } else if (asset.url) {
          imageInputs.push(asset.url);
        }
      }
      if (imageInputs.length > 0) {
        body.imageUrl = imageInputs[0];
        body.imageUrls = imageInputs;
      }
    }

    return success(body);
  }

  private parseSubmitResponse(body: Record<string, unknown>): Result<ProviderAsyncSubmitResult> {
    const jobId = typeof body.jobId === "string" ? body.jobId : undefined;
    if (!jobId) {
      return failure(new ProviderError("Video submit response missing jobId", { providerId: this.config.canonicalProviderId }));
    }
    const status = this.normalizeStatus(typeof body.status === "string" ? body.status : "pending");
    if (status === "completed") {
      const outputs = this.normalizeOutputs(body.outputs);
      return success({
        providerJobId: jobId,
        status: "completed",
        outputs,
        usage: this.normalizeUsage(body.usage),
        safeMetadata: { submittedAt: this.nowIso() },
      });
    }
    return success({
      providerJobId: jobId,
      status: "pending",
      safeMetadata: { submittedAt: this.nowIso() },
    });
  }

  private parsePollResponse(
    body: Record<string, unknown>,
    nextPollAfterMs?: number
  ): Result<ProviderAsyncPollResult> {
    const status = this.normalizeStatus(typeof body.status === "string" ? body.status : "pending");
    if (status === "pending") {
      return success({ status: "pending", nextPollAfterMs: nextPollAfterMs ?? 1000 });
    }
    if (status === "failed") {
      const err = body.error as Record<string, unknown> | undefined;
      return success({
        status: "failed",
        errorCode: typeof err?.code === "string" ? err.code : "provider_failed",
        errorMessage: typeof err?.message === "string" ? err.message : "Video generation failed",
      });
    }
    if (status === "cancelled") {
      return success({ status: "cancelled" });
    }
    return success({
      status: "completed",
      outputs: this.normalizeOutputs(body.outputs),
      usage: this.normalizeUsage(body.usage),
      safeMetadata: { completedAt: this.nowIso() },
    });
  }

  private normalizeStatus(raw: string): "pending" | "completed" | "failed" | "cancelled" {
    const s = raw.toLowerCase();
    if (["completed", "succeeded", "success", "done"].includes(s)) return "completed";
    if (["failed", "error", "rejected"].includes(s)) return "failed";
    if (["cancelled", "canceled"].includes(s)) return "cancelled";
    return "pending";
  }

  private normalizeOutputs(raw: unknown): readonly ProviderOperationMediaOutput[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item, index) => {
      const rec = item as Record<string, unknown>;
      const typeRaw = typeof rec.type === "string" ? rec.type : "video";
      const type =
        typeRaw === "image" || typeRaw === "audio" || typeRaw === "text"
          ? typeRaw
          : typeRaw === "video"
            ? "video"
            : "other";
      return {
        index: typeof rec.index === "number" ? rec.index : index,
        type,
        mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
        temporaryUrl: typeof rec.temporaryUrl === "string" ? rec.temporaryUrl : undefined,
        base64: typeof rec.base64 === "string" ? rec.base64 : undefined,
        storageRef: typeof rec.storageRef === "string" ? rec.storageRef : undefined,
        width: typeof rec.width === "number" ? rec.width : undefined,
        height: typeof rec.height === "number" ? rec.height : undefined,
        durationSeconds: typeof rec.durationSeconds === "number" ? rec.durationSeconds : undefined,
        fps: typeof rec.fps === "number" ? rec.fps : undefined,
      };
    });
  }

  private normalizeUsage(raw: unknown): ProviderAsyncSubmitResult["usage"] {
    if (!raw || typeof raw !== "object") return undefined;
    const u = raw as Record<string, unknown>;
    return {
      videoSeconds: typeof u.videoSeconds === "number" ? u.videoSeconds : undefined,
      computeUnits: typeof u.computeUnits === "number" ? u.computeUnits : undefined,
      providerUnits: typeof u.providerUnits === "number" ? u.providerUnits : undefined,
      generationCount: typeof u.generationCount === "number" ? u.generationCount : undefined,
    };
  }
}

export function catalogVideoProviderId(config: VideoProviderConfig): ProviderId {
  return asProviderId(config.canonicalProviderId);
}
