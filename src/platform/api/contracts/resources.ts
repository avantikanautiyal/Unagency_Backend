/**
 * Rate limit, billing, webhook, file stubs for API surface.
 */

import type { RateLimitDimension } from "./enums";

export interface RateLimitPolicy {
  readonly dimension: RateLimitDimension;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
  readonly dimension: RateLimitDimension;
  readonly key: string;
}

export interface BrandProfileResource {
  readonly brandProfileId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface KnowledgeBaseResource {
  readonly knowledgeBaseId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly name: string;
  readonly documentCount: number;
}

export interface CapabilityResource {
  readonly capabilityId: string;
  readonly name: string;
  readonly department?: string;
  readonly supportedProviders: readonly string[];
}

export interface ProviderCatalogResource {
  readonly providerId: string;
  readonly displayName: string;
  readonly department: string;
  readonly modelCount: number;
  readonly status: string;
}

export interface ModelCatalogResource {
  readonly modelId: string;
  readonly providerId: string;
  readonly label: string;
}

export interface BenchmarkResource {
  readonly evidenceId: string;
  readonly capabilityId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly latencyMs: number;
  readonly cost: number;
  readonly evaluationScore: number;
}

export interface BillingSummaryResource {
  readonly organizationId: string;
  readonly period: string;
  readonly amount: number;
  readonly currency: string;
}

export interface NotificationResource {
  readonly notificationId: string;
  readonly organizationId: string;
  readonly userId?: string;
  readonly title: string;
  readonly body: string;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface AuditLogResource {
  readonly auditId: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly action: string;
  readonly resource: string;
  readonly at: string;
}

export interface FileResource {
  readonly fileId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export interface HumanReviewResource {
  readonly reviewId: string;
  readonly executionId: string;
  readonly disposition: string;
  readonly required: boolean;
}

export interface WebhookEndpointResource {
  readonly webhookId: string;
  readonly organizationId: string;
  readonly url: string;
  readonly events: readonly string[];
  readonly active: boolean;
}
