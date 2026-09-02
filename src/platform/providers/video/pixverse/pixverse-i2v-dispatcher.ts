/**
 * PixVerse I2V leaf — upload image → img_id → img/generate.
 * img_id stays inside provider infrastructure (never canonical asset identity).
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
import type { VendorVideoAuthContext } from "../common/vendor-video-protocol";
import {
  PIXVERSE_IMAGE_UPLOAD_PATH,
  PixverseVideoProtocol,
} from "./pixverse-video-protocol";

export interface ProviderInputBytesLoader {
  loadFromUrl(url: string): Promise<Result<{ data: Buffer; contentType: string }>>;
}

/** Default loader — fetches signed provider input URL (LIVE) or test inject. */
export class FetchProviderInputBytesLoader implements ProviderInputBytesLoader {
  async loadFromUrl(url: string): Promise<Result<{ data: Buffer; contentType: string }>> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return failure(new ValidationError(`Failed to load provider input asset HTTP ${res.status}`));
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "image/png";
      return success({ data: buf, contentType });
    } catch (err) {
      return failure(
        new ValidationError(err instanceof Error ? err.message : "Failed to load provider input asset")
      );
    }
  }
}

export class PixverseI2vDispatcher implements IAsyncProviderDispatcher {
  constructor(
    private readonly providerId: string,
    private readonly protocol: PixverseVideoProtocol,
    private readonly http: IVideoHttpClient,
    private readonly auth: VendorVideoAuthContext,
    private readonly blobAccess?: BlobAccessService,
    private readonly bytesLoader: ProviderInputBytesLoader = new FetchProviderInputBytesLoader()
  ) {}

  executionSemantics(): ProviderExecutionSemantics {
    return "async";
  }
  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }
  supportsCancellation(_providerId: ProviderId): boolean {
    return false;
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
    if (!isVideoGenerationCapability(String(request.capabilityId))) {
      return failure(new ValidationError(`Capability ${request.capabilityId} is not video generation`));
    }
    if (String(request.providerId) !== this.providerId) {
      return failure(new ValidationError(`Provider mismatch: leaf=${this.providerId}`));
    }
    const wireModel = this.protocol.resolveWireModel(request.modelId!);
    if (!wireModel) {
      return failure(new ValidationError(`Model ${request.modelId} not mapped for PixVerse`));
    }

    const authHeaders = this.protocol.buildAuthHeaders(this.auth);
    if (!authHeaders.ok) return authHeaders;

    const imageUrls = await this.resolveImageInputs(request);
    if (!imageUrls.ok) return imageUrls;

    if (imageUrls.value.length === 0) {
      const plan = this.protocol.buildTextToVideoSubmit(request, wireModel, idempotencyKey);
      if (!plan.ok) return plan;
      const response = await this.http.send({
        method: plan.value.method,
        path: plan.value.path,
        body: plan.value.body,
        headers: { ...authHeaders.value, ...(plan.value.headers ?? {}) },
        timeoutMs: 120_000,
      });
      if (!response.ok) return response;
      return this.protocol.parseSubmit(response.value.body);
    }

    // I2V: download tenant-authorized bytes → upload → img_id → generate
    const loaded = await this.bytesLoader.loadFromUrl(imageUrls.value[0]!);
    if (!loaded.ok) return loaded;

    const uploadTrace = `${idempotencyKey}-upload`;
    const upload = await this.http.send({
      method: "POST",
      path: PIXVERSE_IMAGE_UPLOAD_PATH,
      headers: {
        "API-KEY": this.auth.apiKey!,
        "Ai-trace-id": uploadTrace,
      },
      multipart: {
        fieldName: "image",
        filename: "input.png",
        contentType: loaded.value.contentType,
        data: loaded.value.data,
      },
      timeoutMs: 120_000,
    });
    if (!upload.ok) return upload;

    const parsedUpload = this.protocol.parseUpload(upload.value.body);
    if (!parsedUpload.ok) return parsedUpload;

    const genTrace = `${idempotencyKey}-generate`;
    const genPlan = this.protocol.buildImageToVideoSubmit(
      request,
      wireModel,
      parsedUpload.value.imgId,
      genTrace
    );
    if (!genPlan.ok) return genPlan;

    const gen = await this.http.send({
      method: genPlan.value.method,
      path: genPlan.value.path,
      body: genPlan.value.body,
      headers: { ...authHeaders.value, ...(genPlan.value.headers ?? {}) },
      timeoutMs: 120_000,
    });
    if (!gen.ok) return gen;

    const submitted = this.protocol.parseSubmit(gen.value.body);
    if (!submitted.ok) return submitted;
    return success({
      ...submitted.value,
      safeMetadata: {
        ...submitted.value.safeMetadata,
        vendor: "pixverse",
        // img_id is vendor-internal only — never expose as UNAGENCY asset id
        uploadCompleted: true,
      },
    });
  }

  async pollAsync(
    request: ProviderExecutionRequest,
    providerJobId: string,
    _token: CancellationToken
  ): Promise<Result<ProviderAsyncPollResult>> {
    const authHeaders = this.protocol.buildAuthHeaders(this.auth);
    if (!authHeaders.ok) return authHeaders;
    const plan = this.protocol.buildPoll(providerJobId);
    if (!plan.ok) return plan;
    const response = await this.http.send({
      method: plan.value.method,
      path: plan.value.path,
      headers: { ...authHeaders.value },
      timeoutMs: 60_000,
    });
    if (!response.ok) return response;
    return this.protocol.parsePoll(response.value.body);
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
}
