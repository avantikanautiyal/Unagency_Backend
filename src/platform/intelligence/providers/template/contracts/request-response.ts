/**
 * Canonical request/response contracts for the provider template.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type { TemplateModality } from "./enums";
import type { TemplateRequestId } from "./identifiers";
import type { TemplateWirePayload } from "./wire";

export interface TemplateCanonicalRequest {
  readonly requestId: TemplateRequestId;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly capabilityId?: CapabilityId;
  readonly modality: TemplateModality;
  readonly input: Readonly<Record<string, unknown>>;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly features: readonly string[];
  readonly streaming: boolean;
  readonly timeoutMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface TemplateTokenUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly reasoningTokens?: number;
}

export interface TemplateCanonicalResponse {
  readonly requestId: TemplateRequestId;
  readonly providerId: ProviderId;
  readonly modelId: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly usage?: TemplateTokenUsage;
  readonly wirePayload?: TemplateWirePayload;
  readonly completedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
