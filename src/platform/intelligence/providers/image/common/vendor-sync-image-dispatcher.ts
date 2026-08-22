/**
 * Sync image dispatcher — image.generate via verified vendor protocols.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ProviderError, ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { IVendorImageProtocol, VendorImageAuthContext } from "../common/vendor-image-protocol";
import { resolveImageWireModelId } from "../common/vendor-image-protocol";
import type { IImageHttpClient } from "../http/image-http-client";
import { isImageGenerationCapability } from "../../common/resolve-execution-modality";
import { normalizeImageUsage } from "../../common/media-output";

function authHeaders(
  spec: VerifiedImageProviderSpec,
  apiKey: string | undefined
): Record<string, string> {
  if (!apiKey) return {};
  switch (spec.authHeaderKind) {
    case "x-key":
      return { "x-key": apiKey };
    case "api-key":
      return { "Api-Key": apiKey };
    case "x-goog-api-key":
      return { "x-goog-api-key": apiKey };
    case "bearer":
    default:
      return { Authorization: `Bearer ${apiKey}` };
  }
}

export class VendorSyncImageDispatcher implements IProviderDispatcher {
  constructor(
    private readonly spec: VerifiedImageProviderSpec,
    private readonly protocol: IVendorImageProtocol,
    private readonly http: IImageHttpClient,
    private readonly auth: VendorImageAuthContext,
    private readonly nowIso: () => string = () => new Date().toISOString(),
    private readonly clockMs: () => number = () => Date.now()
  ) {}

  supportsStreaming(_providerId: ProviderId): boolean {
    return false;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken,
    _onChunk?: StreamingChunkListener
  ): Promise<Result<ProviderExecutionResponse>> {
    if (!isImageGenerationCapability(String(request.capabilityId))) {
      return failure(
        new ValidationError(
          `${this.spec.displayName} does not support capability '${request.capabilityId}'`
        )
      );
    }

    const wireModelId = resolveImageWireModelId(
      request.modelId ?? this.spec.inventoryModelId
    );
    if (!this.protocol.validateModel(this.spec, wireModelId)) {
      return failure(
        new ValidationError(
          `Model '${request.modelId}' is not supported by ${this.spec.displayName}`
        )
      );
    }

    const plan = this.protocol.buildGenerateRequest({
      spec: this.spec,
      request,
      wireModelId,
    });

    const headers = {
      ...plan.request.headers,
      ...authHeaders(this.spec, this.auth.apiKey),
    };

    const started = this.clockMs();
    const submit = await this.http.send({ ...plan.request, headers });
    if (!submit.ok) return submit;

    let body = submit.value.body;

    if (plan.pollPathTemplate && typeof body.id === "string") {
      const pollPath = plan.pollPathTemplate.replace("{id}", encodeURIComponent(body.id));
      const maxAttempts = 40;
      for (let i = 0; i < maxAttempts; i++) {
        const poll = await this.http.send({
          method: "GET",
          path: pollPath,
          headers: authHeaders(this.spec, this.auth.apiKey),
          timeoutMs: 30_000,
        });
        if (!poll.ok) return poll;
        body = poll.value.body;
        const status = String(body.status ?? "").toLowerCase();
        if (status === "ready" || status === "complete" || status === "completed") break;
        if (status === "error" || status === "failed") {
          return failure(
            new ProviderError(this.protocol.mapProviderError(poll.value.status, body), {
              providerId: this.spec.canonicalProviderId,
              body,
            })
          );
        }
      }
    }

    const normalized = this.protocol.normalizeGenerateResponse({
      spec: this.spec,
      body,
      headers: submit.value.headers,
    });

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: normalized.output,
      usage: normalizeImageUsage(normalized.usage) ?? normalized.usage,
      providerRequestId: normalized.providerRequestId,
      streamed: false,
      finishedAt: this.nowIso(),
      statistics: {
        executionMs: this.clockMs() - started,
        streamingMs: 0,
        retries: 0,
      },
    });
  }
}
