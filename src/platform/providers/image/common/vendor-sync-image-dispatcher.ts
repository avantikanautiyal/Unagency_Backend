/**
 * Sync image dispatcher — image.generate via verified vendor protocols.
 */

import { failure, success, type Result } from "../../../core/result";
import { ProviderError, ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
import type {
  IProviderDispatcher,
  StreamingChunkListener,
} from "../../runtime/interfaces/provider-dispatcher";
import type { CancellationToken } from "../../runtime/contracts/cancellation";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../runtime/contracts/provider-execution-response";
import type { VerifiedImageProviderSpec } from "../configs/verified-image-provider-specs";
import type { IVendorImageProtocol, VendorImageAuthContext } from "../common/vendor-image-protocol";
import { resolveImageWireModelId, extractPrompt, extractReferenceImage } from "../common/vendor-image-protocol";
import { isImageGenerationCapability } from "../../common/resolve-execution-modality";
import { providerSupportsReferenceImageEdit } from "../configs/image-provider-capabilities";
import {
  logForensicImageConstraintAudit,
  sanitizeProviderWireBody,
} from "../../../collaboration/conversational-task-intelligence/forensic-image-constraint-audit";
import { normalizeImageUsage } from "../../common/media-output";
import type { IImageHttpClient } from "../http/image-http-client";

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

    const reference = extractReferenceImage(request.payload ?? {});
    const operationKind =
      typeof request.metadata?.visualOperationKind === "string"
        ? request.metadata.visualOperationKind.toUpperCase()
        : "";
    const requiresReferenceEdit =
      String(request.capabilityId).toLowerCase() === "image.edit" ||
      operationKind === "MODIFY" ||
      operationKind === "REGENERATE";
    if (requiresReferenceEdit && reference && !providerSupportsReferenceImageEdit(this.spec.canonicalProviderId)) {
      return failure(
        new ValidationError(
          `${this.spec.displayName} does not support reference-image modification`,
          {
            reason: "UNSUPPORTED_OPERATION",
            providerId: this.spec.canonicalProviderId,
            capabilityId: request.capabilityId,
          },
        ),
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

    const wireBody =
      plan.request.body && typeof plan.request.body === "object"
        ? (plan.request.body as Record<string, unknown>)
        : {};
    const formPrompt = plan.request.form?.fields?.prompt;
    const wireForAudit: Record<string, unknown> = {
      ...wireBody,
      ...(typeof formPrompt === "string" ? { prompt: formPrompt } : {}),
      ...(plan.request.form?.files?.length
        ? {
            style_reference_images: plan.request.form.files.map(
              (file) => file.fieldName
            ),
          }
        : {}),
    };
    logForensicImageConstraintAudit({
      executionId:
        typeof request.context?.executionId === "string"
          ? String(request.context.executionId)
          : request.requestId,
      productAction:
        typeof request.payload?.productAction === "string"
          ? request.payload.productAction
          : undefined,
      stage: "provider_wire_request",
      metadata: request.metadata,
      providerId: String(this.spec.canonicalProviderId),
      modelId: wireModelId,
      capabilityId: String(request.capabilityId),
      generationPath: `VendorSyncImageDispatcher/${this.spec.displayName}`,
      prompt: extractPrompt(request.payload ?? {}),
      providerWire: sanitizeProviderWireBody(wireForAudit),
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

    // A reply with no image (Gemini sometimes answers in text only) is a
    // failed attempt, not a success — otherwise the run "succeeds" with
    // "[0 image(s)]", nothing fails over, and the step ends with no creative.
    const imageCount = countImageOutputs(normalized.output);
    if (imageCount === 0) {
      const reply = describeImagelessReply(body);
      console.warn(
        JSON.stringify({
          scope: "provider.image",
          event: "image_reply_without_image",
          providerId: String(this.spec.canonicalProviderId),
          modelId: wireModelId,
          requestId: request.requestId,
          ...reply,
        }),
      );
      return failure(
        new ProviderError(NO_IMAGE_REPLY_MESSAGE, {
          providerId: this.spec.canonicalProviderId,
          requestId: request.requestId,
          providerErrorCode: "no_image_output",
          ...(reply.finishReason ? { finishReason: reply.finishReason } : {}),
        }),
      );
    }

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

/** User-safe text; vendor reply details go to logs only. */
export const NO_IMAGE_REPLY_MESSAGE = "The image model replied without an image.";

function countImageOutputs(output: Readonly<Record<string, unknown>> | undefined): number {
  const outputs = output?.outputs;
  if (!Array.isArray(outputs)) return 0;
  return outputs.filter((o) => {
    if (!o || typeof o !== "object") return false;
    const rec = o as Record<string, unknown>;
    return (
      (typeof rec.url === "string" && rec.url.length > 0) ||
      (typeof rec.base64 === "string" && rec.base64.length > 0) ||
      (typeof rec.storageRef === "string" && rec.storageRef.length > 0)
    );
  }).length;
}

/** Why the vendor answered without an image (finish/block reason, text excerpt). */
function describeImagelessReply(body: Readonly<Record<string, unknown>>): {
  finishReason?: string;
  blockReason?: string;
  textExcerpt?: string;
} {
  const out: { finishReason?: string; blockReason?: string; textExcerpt?: string } = {};
  const feedback = body.promptFeedback as Record<string, unknown> | undefined;
  if (typeof feedback?.blockReason === "string") out.blockReason = feedback.blockReason;
  const candidates = Array.isArray(body.candidates)
    ? (body.candidates as Array<Record<string, unknown>>)
    : [];
  const first = candidates[0];
  if (typeof first?.finishReason === "string") out.finishReason = first.finishReason;
  const parts = (first?.content as Record<string, unknown> | undefined)?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((part) =>
        part && typeof (part as Record<string, unknown>).text === "string"
          ? String((part as Record<string, unknown>).text)
          : "",
      )
      .join(" ")
      .trim();
    if (text) out.textExcerpt = text.slice(0, 200);
  }
  return out;
}
