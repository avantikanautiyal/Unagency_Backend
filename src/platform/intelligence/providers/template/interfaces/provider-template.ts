/**
 * Universal Provider Template public interfaces.
 */

import type { Result } from "../../../shared/result";
import type { ProviderId } from "../../../shared/identifiers";
import type { CanonicalModel } from "../../../model-registry/contracts/model";
import type {
  TemplateCanonicalRequest,
  TemplateCanonicalResponse,
  TemplateTokenUsage,
} from "../contracts/request-response";
import type { TemplateProviderError } from "../contracts/errors";
import type { TemplateFeatureMatrix } from "../contracts/features";
import type { TemplateHealthReport, TemplateHealthCheck } from "../contracts/health";
import type { TemplateLifecycleState } from "../contracts/lifecycle";
import type { TemplateProviderMetrics, TemplateMetricsSnapshot } from "../contracts/metrics";
import type { TemplateStreamChunk, TemplateStreamSession } from "../contracts/streaming";
import type { TemplateWirePayload } from "../contracts/wire";

export interface IProviderClient {
  readonly providerId: ProviderId;
  initialize(): Promise<Result<void>>;
  shutdown(): Promise<Result<void>>;
  getLifecycle(): TemplateLifecycleState;
}

export interface IProviderStreamingEngine {
  openSession(request: TemplateCanonicalRequest): Result<TemplateStreamSession>;
  processChunk(sessionId: string, chunk: TemplateStreamChunk): Result<void>;
  closeSession(sessionId: string): Result<readonly TemplateStreamChunk[]>;
}

export interface IProviderReasoningEngine {
  supportsReasoning(modelId: string): Result<boolean>;
  configureReasoning(request: TemplateCanonicalRequest): Result<TemplateCanonicalRequest>;
}

export interface IProviderVisionEngine {
  supportsVision(modelId: string): Result<boolean>;
  prepareVisionInput(request: TemplateCanonicalRequest): Result<TemplateCanonicalRequest>;
}

export interface IProviderImageEngine {
  supportsImageGeneration(modelId: string): Result<boolean>;
  mapImageRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderVideoEngine {
  supportsVideoGeneration(modelId: string): Result<boolean>;
  mapVideoRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderAudioEngine {
  supportsAudioInput(modelId: string): Result<boolean>;
  supportsAudioOutput(modelId: string): Result<boolean>;
  mapAudioRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderEmbeddingEngine {
  supportsEmbeddings(modelId: string): Result<boolean>;
  mapEmbeddingRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderModerationEngine {
  supportsModeration(modelId: string): Result<boolean>;
  mapModerationRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderFunctionCallingEngine {
  supportsFunctionCalling(modelId: string): Result<boolean>;
  mapFunctionCallRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderToolEngine {
  supportsTools(modelId: string): Result<boolean>;
  mapToolRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderAssistantEngine {
  supportsAssistants(modelId: string): Result<boolean>;
  mapAssistantRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderHealthEngine {
  check(): Promise<Result<TemplateHealthReport>>;
  runChecks(): Promise<Result<readonly TemplateHealthCheck[]>>;
}

export interface IProviderMetricsCollector {
  record(metrics: TemplateProviderMetrics): Result<void>;
  snapshot(): Result<TemplateMetricsSnapshot>;
  reset(): Result<void>;
}

export interface IProviderDiagnostics {
  inspect(): Result<Readonly<Record<string, unknown>>>;
  featureMatrix(): Result<TemplateFeatureMatrix>;
}

export interface IProviderCapabilityMapper {
  mapCapabilities(model: CanonicalModel): Result<readonly string[]>;
  supportsFeature(model: CanonicalModel, feature: string): Result<boolean>;
}

export interface IProviderRequestMapper {
  toWireRequest(request: TemplateCanonicalRequest): Result<TemplateWirePayload>;
}

export interface IProviderResponseMapper {
  toCanonicalResponse(
    request: TemplateCanonicalRequest,
    wire: TemplateWirePayload
  ): Result<TemplateCanonicalResponse>;
}

export interface IProviderModelMapper {
  resolveModel(modelId: string): Result<CanonicalModel>;
  listModels(): Result<readonly CanonicalModel[]>;
}

export interface IProviderUsageMapper {
  mapUsage(wire: TemplateWirePayload): Result<TemplateTokenUsage>;
}

export interface IProviderErrorMapper {
  mapError(raw: unknown): TemplateProviderError;
}

export interface IProviderSdk {
  readonly providerId: ProviderId;
  invoke(wire: TemplateWirePayload): Promise<Result<TemplateWirePayload>>;
}

export interface IProviderAdapter {
  readonly providerId: ProviderId;
  translate(request: TemplateCanonicalRequest): Promise<Result<TemplateCanonicalResponse>>;
}

export interface IProviderTemplateEngine {
  bootstrap(): Promise<Result<TemplateLifecycleState>>;
  getHealth(): Promise<Result<TemplateHealthReport>>;
  getFeatureMatrix(): Result<TemplateFeatureMatrix>;
}
