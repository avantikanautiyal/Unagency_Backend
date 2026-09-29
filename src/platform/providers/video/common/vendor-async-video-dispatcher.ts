/**
 * Shared async video dispatcher driven by a verified IVendorVideoProtocol.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
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
} from "../../async/contracts/provider-operation";
import type { BlobAccessService } from "../../../media/blob/blob-access-service";
import { extractInputAssets } from "../../common/input-asset-validator";
import { resolveProviderInputImageUrl } from "../../common/resolve-provider-input-image-url";
import { isVideoGenerationCapability } from "../../common/resolve-execution-modality";
import type { IVideoHttpClient } from "../http/video-http-client";
import type {
  IVendorVideoProtocol,
  VendorVideoAuthContext,
} from "./vendor-video-protocol";

function isDiscontinuedVideoModelError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("discontinued") ||
    m.includes("no longer available") ||
    (m.includes("model") && (m.includes("not available") || m.includes("unsupported")))
  );
}

export class VendorAsyncVideoDispatcher implements IAsyncProviderDispatcher {
  constructor(
    private readonly providerId: string,
    private readonly protocol: IVendorVideoProtocol,
    private readonly http: IVideoHttpClient,
    private readonly auth: VendorVideoAuthContext,
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
    return this.protocol.supportsCancellation;
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
    const gate = this.enforce(request);
    if (!gate.ok) return gate;

    const wireModel = this.protocol.resolveWireModel(request.modelId!);
    if (!wireModel) {
      return failure(new ValidationError(`Model ${request.modelId} not mapped for ${this.providerId}`));
    }

    const authHeaders = this.protocol.buildAuthHeaders(this.auth);
    if (!authHeaders.ok) return authHeaders;

    const imageUrls = await this.resolveImageInputs(request);
    if (!imageUrls.ok) return imageUrls;

    const wireCandidates = this.wireSubmitCandidates(wireModel);
    let lastFailure: Result<ProviderAsyncSubmitResult> | undefined;

    for (const candidate of wireCandidates) {
      const plan = this.protocol.buildSubmit(request, candidate, imageUrls.value, idempotencyKey);
      if (!plan.ok) return plan;

      const path = this.withQuery(plan.value.path, plan.value.query);
      const response = await this.http.send({
        method: plan.value.method,
        path,
        body: plan.value.body,
        headers: { ...authHeaders.value, ...(plan.value.headers ?? {}) },
        timeoutMs: 120_000,
      });
      if (!response.ok) {
        lastFailure = response as Result<ProviderAsyncSubmitResult>;
        const errMsg =
          response.error instanceof Error ? response.error.message : String(response.error);
        const canRetryWire =
          isDiscontinuedVideoModelError(errMsg) &&
          candidate !== wireCandidates[wireCandidates.length - 1];
        if (canRetryWire) continue;
        return response as Result<ProviderAsyncSubmitResult>;
      }

      const parsed = this.protocol.parseSubmit(response.value.body, response.value.headers);
      if (!parsed.ok) return parsed;

      // Kling: encode submit mode into providerJobId so poll survives reconciler rebuild
      // without original image assets in the request payload.
      if (this.protocol.vendorId === "kling" && !parsed.value.providerJobId.includes(":")) {
        const klingMode = plan.value.path.includes("image2video")
          ? "image2video"
          : "text2video";
        return success({
          ...parsed.value,
          providerJobId: `${klingMode}:${parsed.value.providerJobId}`,
          safeMetadata: {
            ...parsed.value.safeMetadata,
            klingMode,
            ...(candidate !== wireModel ? { wireModelFallback: candidate } : {}),
          },
        });
      }

      if (candidate !== wireModel) {
        return success({
          ...parsed.value,
          safeMetadata: { ...parsed.value.safeMetadata, wireModelFallback: candidate },
        });
      }

      return parsed;
    }

    return lastFailure ?? failure(new ValidationError(`Model ${request.modelId} submit failed`));
  }

  private wireSubmitCandidates(primaryWire: string): readonly string[] {
    const proto = this.protocol as IVendorVideoProtocol & {
      resolveWireFallbacks?: (wireModel: string) => readonly string[];
    };
    if (typeof proto.resolveWireFallbacks !== "function") return [primaryWire];
    const rest = proto.resolveWireFallbacks(primaryWire);
    return [primaryWire, ...rest];
  }

  async pollAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>> {
    const gate = this.enforce(request);
    if (!gate.ok) return gate;

    const authHeaders = this.protocol.buildAuthHeaders(this.auth);
    if (!authHeaders.ok) return authHeaders;

    const plan = this.protocol.buildPoll(providerJobId, request);
    if (!plan.ok) return plan;

    const path = this.withQuery(plan.value.path, plan.value.query);
    const response = await this.http.send({
      method: plan.value.method,
      path,
      headers: { ...authHeaders.value, ...(plan.value.headers ?? {}) },
      timeoutMs: 60_000,
    });
    if (!response.ok) return response;

    return this.protocol.parsePoll(response.value.body, response.value.headers);
  }

  async cancelAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<void>> {
    if (!this.protocol.supportsCancellation || !this.protocol.buildCancel) {
      return failure(new ValidationError("Provider does not support cancellation"));
    }
    const gate = this.enforce(request);
    if (!gate.ok) return gate;

    const authHeaders = this.protocol.buildAuthHeaders(this.auth);
    if (!authHeaders.ok) return authHeaders;

    const plan = this.protocol.buildCancel(providerJobId);
    if (!plan.ok) return plan;

    const response = await this.http.send({
      method: plan.value.method,
      path: plan.value.path,
      body: plan.value.body,
      headers: { ...authHeaders.value, ...(plan.value.headers ?? {}) },
      timeoutMs: 30_000,
    });
    if (!response.ok) return response;
    return success(undefined);
  }

  private enforce(request: ProviderExecutionRequest): Result<void> {
    if (!isVideoGenerationCapability(String(request.capabilityId))) {
      return failure(new ValidationError(`Capability ${request.capabilityId} is not video generation`));
    }
    if (String(request.providerId) !== this.providerId) {
      return failure(
        new ValidationError(
          `Provider mismatch: leaf=${this.providerId} request=${request.providerId}`
        )
      );
    }
    if (!request.modelId) {
      return failure(new ValidationError("modelId is required for video generation"));
    }
    if (!this.protocol.resolveWireModel(request.modelId)) {
      return failure(new ValidationError(`Model ${request.modelId} is not executable on ${this.providerId}`));
    }
    return success(undefined);
  }

  private async resolveImageInputs(
    request: ProviderExecutionRequest
  ): Promise<Result<readonly string[]>> {
    const assets = extractInputAssets(request.payload);
    if (assets.length === 0) return success([]);
    const urls: string[] = [];
    for (const asset of assets) {
      const resolved = await resolveProviderInputImageUrl({
        asset,
        organizationId: String(request.context.organizationId),
        blobAccess: this.blobAccess,
      });
      if (!resolved.ok) return resolved;
      urls.push(resolved.value);
    }
    return success(urls);
  }

  private withQuery(path: string, query?: Readonly<Record<string, string>>): string {
    if (!query || Object.keys(query).length === 0) return path;
    const qs = new URLSearchParams(query).toString();
    return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`;
  }
}
