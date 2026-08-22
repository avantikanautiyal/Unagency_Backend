/**
 * Deterministic testing utilities for the negotiation platform.
 *
 * Purpose: Build fixtures + a wired engine with controllable inputs.
 * Responsibilities: Fakes for the registry ports + object fixtures.
 * Usage: Imported by unit tests.
 * Future Extension: Fixtures for multi-provider ensembles.
 */

import type { CapabilityId } from "../../../shared/identifiers";
import {
  asCapabilityId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import { IntelligenceError } from "../../../shared/errors";
import { failure, success, type Result } from "../../../shared/result";
import type { CapabilityDefinition } from "../../../capability-registry/contracts/capability-definition";
import type {
  CapabilityResolveOptions,
  ICapabilityRegistry,
} from "../../../capability-registry/interfaces/capability-registry";
import type { CapabilityVersion } from "../../../capability-registry/contracts/capability-version";
import { ProviderCapabilityMatrix } from "../../capability-matrix/implementations/provider-capability-matrix";
import type { ProviderCapabilityProfile } from "../../capability-matrix/contracts/provider-capabilities";
import { InMemoryProviderHealthStore } from "../../health/in-memory-provider-health-store";
import type { ProviderDefinition } from "../../metadata/provider-definition";
import type { IProviderRegistry } from "../../registry/provider-registry";
import type { IProviderIdentityEngine } from "../../identity/interfaces/identity-engine";
import type { ExecutionPlan } from "../../../execution-planning/contracts/execution-plan";
import {
  createNegotiationEngine,
  type CreateNegotiationEngineOptions,
} from "../factories/create-negotiation-engine";
import { NegotiationRequestBuilder } from "../builders/negotiation-request-builder";
import type { NegotiationProfile } from "../contracts/negotiation-result";
import type { NegotiationRequest } from "../contracts/negotiation-request";
import type { IProviderNegotiationEngine } from "../interfaces/negotiation-engine";

export const TEST_CAPABILITY = asCapabilityId("cap-text-generation");
export const TEST_PROVIDER = asProviderId("provider-openai");
export const TEST_FALLBACK_PROVIDER = asProviderId("provider-anthropic");
export const TEST_ORG = asOrganizationId("org-1");
export const TEST_WORKSPACE = asWorkspaceId("ws-1");

const NOW = "2026-01-01T00:00:00.000Z";

export function makeCapability(
  overrides: Partial<CapabilityDefinition> = {}
): CapabilityDefinition {
  return {
    id: TEST_CAPABILITY,
    name: "text-generation",
    version: "1.0.0",
    displayName: "Text Generation",
    description: "Generate text",
    category: "text",
    tags: [],
    status: "published",
    owner: "platform",
    visibility: "public",
    inputSchema: { contentTypes: ["application/json"] },
    outputSchema: { contentTypes: ["application/json"] },
    supportedModalities: ["text"],
    providerCompatibility: { compatibleProviderIds: [TEST_PROVIDER] },
    fallbackProviders: [],
    timeout: { timeoutMs: 30000 },
    retryPolicy: { maxAttempts: 2, backoffMs: 100, strategy: "fixed" },
    evaluationStrategy: { enabled: false },
    costLimit: { maxCost: 1.0, currency: "USD" },
    humanReviewPolicy: { required: false },
    securityClassification: "internal",
    requiredPermissions: ["execute"],
    constraints: {},
    policies: {},
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeProvider(
  overrides: Partial<ProviderDefinition> = {}
): ProviderDefinition {
  return {
    id: TEST_PROVIDER,
    vendor: "openai",
    displayName: "OpenAI",
    version: "1.0.0",
    status: "active",
    supportedModalities: ["text"],
    supportedCapabilities: [TEST_CAPABILITY],
    supportedRegions: ["us-east-1", "eu-west-1"],
    authenticationType: "api_key",
    pricingModel: "token",
    concurrencyLimits: {},
    timeoutLimits: { defaultTimeoutMs: 30000, maxTimeoutMs: 60000 },
    rateLimits: {},
    streamingSupport: true,
    functionCallingSupport: true,
    visionSupport: true,
    embeddingsSupport: false,
    imageSupport: false,
    audioSupport: false,
    videoSupport: false,
    metadata: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeProfile(
  overrides: Partial<ProviderCapabilityProfile> = {}
): ProviderCapabilityProfile {
  return {
    providerId: TEST_PROVIDER,
    features: {
      supportsText: true,
      supportsImage: false,
      supportsVideo: false,
      supportsEmbeddings: false,
      supportsModeration: false,
      supportsStreaming: true,
      supportsVision: true,
      supportsAudio: false,
      supportsFunctionCalling: true,
    },
    modalities: ["text"],
    maxContextTokens: 128000,
    attributes: { supportsReasoning: true, supportsJsonMode: true },
    ...overrides,
  };
}

export function makePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  const base: ExecutionPlan = {
    planId: "plan-1",
    capabilityId: TEST_CAPABILITY,
    executionStrategy: "direct",
    executionMode: "sequential",
    priority: "normal",
    providerSelection: {
      primaryProviderId: TEST_PROVIDER,
      fallbackProviderIds: [],
      modelId: "gpt-model",
    },
    retry: { maxAttempts: 2, backoffMs: 100, strategy: "fixed" },
    timeout: { timeoutMs: 30000 },
    budget: { maxCost: 0.5, currency: "USD" },
    evaluation: { enabled: false },
    humanReview: { required: false },
    executionPolicy: { policyRefs: [] },
    routingConstraints: { requiredFeatures: [], excludedProviderIds: [] },
    graph: {
      entryNodeId: "n1",
      exitNodeId: "n1",
      nodes: [
        { id: "n1", kind: "capability", label: "cap", stageId: "s1", order: 0 },
      ],
      edges: [],
      stages: [
        { id: "s1", name: "stage", mode: "sequential", order: 0, nodeIds: ["n1"] },
      ],
    },
    metadata: {
      planId: "plan-1",
      capabilityId: TEST_CAPABILITY,
      primaryProviderId: TEST_PROVIDER,
      fallbackProviderIds: [],
      strategy: "direct",
      priority: "normal",
      costEstimate: {},
      createdAt: NOW,
    },
    ...overrides,
  };
  return base;
}

export function makeRequest(
  planOverrides: Partial<ExecutionPlan> = {},
  requestOverrides: Partial<NegotiationRequest> = {}
): NegotiationRequest {
  const built = new NegotiationRequestBuilder()
    .withPlan(makePlan(planOverrides))
    .withOrganization(TEST_ORG)
    .withWorkspace(TEST_WORKSPACE)
    .build();
  return { ...built, ...requestOverrides };
}

/**
 * Minimal fake capability registry implementing the real port.
 * TEST-ONLY — marked so production composition assertions can reject it.
 */
export class FakeCapabilityRegistry implements ICapabilityRegistry {
  readonly __unagencyTestFake = true as const;
  private readonly items = new Map<string, CapabilityDefinition>();

  seed(capability: CapabilityDefinition): void {
    this.items.set(String(capability.id), capability);
  }

  register(c: CapabilityDefinition): Result<CapabilityDefinition> {
    this.seed(c);
    return success(c);
  }
  unregister(): Result<void> {
    return success(undefined);
  }
  replace(c: CapabilityDefinition): Result<CapabilityDefinition> {
    this.seed(c);
    return success(c);
  }
  validate(c: CapabilityDefinition): Result<CapabilityDefinition> {
    return success(c);
  }
  resolve(
    id: CapabilityId,
    _options?: CapabilityResolveOptions
  ): Result<CapabilityDefinition> {
    const found = this.items.get(String(id));
    if (!found) {
      return failure(new IntelligenceError("capability not found", { code: "NOT_FOUND" }));
    }
    return success(found);
  }
  exists(id: CapabilityId): boolean {
    return this.items.has(String(id));
  }
  list(): readonly CapabilityDefinition[] {
    return [...this.items.values()];
  }
  listVersions(): readonly CapabilityDefinition[] {
    return this.list();
  }
  getVersion(): Result<CapabilityVersion> {
    return failure(new IntelligenceError("not supported", { code: "NOT_IMPLEMENTED" }));
  }
  clear(): void {
    this.items.clear();
  }
}

/**
 * Minimal fake provider registry implementing the real port.
 */
export class FakeProviderRegistry implements IProviderRegistry {
  private readonly providers = new Map<string, ProviderDefinition>();

  seed(provider: ProviderDefinition): void {
    this.providers.set(String(provider.id), provider);
  }

  registerProvider(p: ProviderDefinition): Result<ProviderDefinition> {
    this.seed(p);
    return success(p);
  }
  unregisterProvider(): Result<void> {
    return success(undefined);
  }
  resolveProvider(id: ProviderDefinition["id"]): Result<ProviderDefinition> {
    const found = this.providers.get(String(id));
    if (!found) {
      return failure(new IntelligenceError("provider not found", { code: "NOT_FOUND" }));
    }
    return success(found);
  }
  listProviders(): readonly ProviderDefinition[] {
    return [...this.providers.values()];
  }
  providerExists(id: ProviderDefinition["id"]): boolean {
    return this.providers.has(String(id));
  }
  validateProvider(p: ProviderDefinition): Result<ProviderDefinition> {
    return success(p);
  }
  listHealthyProviders(): readonly ProviderDefinition[] {
    return this.listProviders();
  }
  clear(): void {
    this.providers.clear();
  }
}

export interface TestNegotiationSetup {
  readonly engine: IProviderNegotiationEngine;
  readonly capabilityRegistry: FakeCapabilityRegistry;
  readonly providerRegistry: FakeProviderRegistry;
  readonly matrix: ProviderCapabilityMatrix;
  readonly health: InMemoryProviderHealthStore;
}

export interface SetupOptions {
  readonly capability?: CapabilityDefinition;
  readonly provider?: ProviderDefinition;
  readonly profile?: ProviderCapabilityProfile;
  readonly extraProviders?: readonly ProviderDefinition[];
  readonly extraProfiles?: readonly ProviderCapabilityProfile[];
  readonly negotiationProfile?: Partial<NegotiationProfile>;
  readonly identityEngine?: IProviderIdentityEngine;
  readonly engineOptions?: Partial<CreateNegotiationEngineOptions>;
}

export function setupNegotiation(
  options: SetupOptions = {}
): TestNegotiationSetup {
  const capabilityRegistry = new FakeCapabilityRegistry();
  const providerRegistry = new FakeProviderRegistry();
  const matrix = new ProviderCapabilityMatrix();
  const health = new InMemoryProviderHealthStore();

  capabilityRegistry.seed(options.capability ?? makeCapability());
  providerRegistry.seed(options.provider ?? makeProvider());
  matrix.upsert(options.profile ?? makeProfile());

  for (const provider of options.extraProviders ?? []) {
    providerRegistry.seed(provider);
  }
  for (const profile of options.extraProfiles ?? []) {
    matrix.upsert(profile);
  }

  const engine = createNegotiationEngine({
    capabilityRegistry,
    providerRegistry,
    capabilityMatrix: matrix,
    healthStore: health,
    identityEngine: options.identityEngine,
    profile: options.negotiationProfile,
    nowIso: () => NOW,
    createId: (prefix: string) => `${prefix}_test`,
    ...options.engineOptions,
  });

  return { engine, capabilityRegistry, providerRegistry, matrix, health };
}
