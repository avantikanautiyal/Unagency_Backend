/**
 * Deterministic test fixtures + fakes for the adapter platform.
 *
 * Purpose: Make adapter tests concise and deterministic.
 * Responsibilities: Manifest/model/negotiated-execution fixtures; a concrete
 *   text adapter (identity wire mapping) since abstract adapters cannot be
 *   instantiated; platform setup helper.
 * Usage: Imported by unit tests only.
 * Future Extension: Fixtures for additional modalities.
 */

import {
  asCapabilityId,
  asProviderId,
  type ProviderId,
} from "../../../shared/identifiers";
import { success, type Result } from "../../../shared/result";
import { NO_RETRY_POLICY } from "../../runtime/contracts/retry-policy";
import type { NegotiatedExecution } from "../../negotiation/contracts/negotiated-execution";
import { AbstractTextProviderAdapter } from "../base/specialized-adapters";
import type { AbstractAdapterDeps } from "../base/abstract-provider-adapter";
import type { ProviderAdapterMetadata } from "../contracts/adapter-descriptor";
import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
} from "../contracts/adapter-io";
import { asProviderAdapterId } from "../contracts/identifiers";
import type { ProviderManifest } from "../contracts/provider-manifest";
import type { ProviderTranslationResult } from "../contracts/results";
import { ProviderManifestBuilder } from "../builders/provider-manifest-builder";
import { ProviderModelBuilder } from "../builders/provider-model-builder";
import { createAdapterPlatform, type AdapterPlatform } from "../factories/create-adapter-platform";

export const TEST_PROVIDER_ID = asProviderId("test-provider");
export const TEST_ADAPTER_ID = asProviderAdapterId("test-adapter");
export const TEST_CAPABILITY_ID = asCapabilityId("text.generate");
export const FIXED_NOW = "2026-01-01T00:00:00.000Z";

export function fixedNow(): string {
  return FIXED_NOW;
}

let idCounter = 0;
export function fixedId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function makeManifest(
  overrides?: (builder: ProviderManifestBuilder) => void
): ProviderManifest {
  const model = new ProviderModelBuilder()
    .withId("test-model")
    .withDisplayName("Test Model")
    .withModalities(["text"])
    .withCapability({
      streaming: true,
      toolCalling: true,
      jsonMode: true,
      reasoning: true,
      structuredOutputs: true,
      contextWindow: 128_000,
      maxOutputTokens: 4096,
    })
    .asDefault()
    .build();

  const builder = new ProviderManifestBuilder()
    .withProviderId(TEST_PROVIDER_ID)
    .withVendor("test")
    .withDisplayName("Test Provider")
    .withVersion("1.0.0")
    .withModalities(["text"])
    .withModels([model])
    .withDefaultModels({ text: "test-model" })
    .withCapabilities(["text.generate"])
    .withAuthenticationTypes(["api_key"])
    .withStreaming({
      supported: true,
      chunkModes: ["delta"],
      heartbeat: true,
      endMarker: true,
    })
    .withSupportedRegions(["us-east-1", "eu-west-1"])
    .withStatus("ready")
    .withMaturity("stable")
    .withTimestamps(FIXED_NOW, FIXED_NOW);

  overrides?.(builder);
  return builder.build();
}

export function makeAdapterMetadata(
  overrides?: Partial<ProviderAdapterMetadata>
): ProviderAdapterMetadata {
  return {
    adapterId: TEST_ADAPTER_ID,
    providerId: TEST_PROVIDER_ID,
    vendor: "test",
    category: "text",
    version: "1.0.0",
    description: "Test text adapter",
    tags: ["test"],
    ...overrides,
  };
}

/**
 * A concrete adapter used only in tests. translateRequest performs an identity
 * mapping to a plain wire payload (no vendor SDK).
 */
export class FakeTextAdapter extends AbstractTextProviderAdapter {
  constructor(
    manifest: ProviderManifest = makeManifest(),
    metadata: ProviderAdapterMetadata = makeAdapterMetadata(),
    deps: AbstractAdapterDeps = { nowIso: fixedNow }
  ) {
    super(metadata, manifest, deps);
  }

  translateRequest(
    request: ProviderAdapterRequest
  ): Result<ProviderTranslationResult<ProviderWirePayload>> {
    return success({
      value: {
        model: request.modelId,
        messages: request.input.messages ?? request.input,
        stream: request.streaming,
        ...request.parameters,
      },
      warnings: [],
      droppedFields: [],
    });
  }
}

export function makeNegotiatedExecution(
  overrides?: Partial<NegotiatedExecution>
): NegotiatedExecution {
  const providerId: ProviderId = overrides?.selectedProviderId ?? TEST_PROVIDER_ID;
  return {
    negotiationId: "neg_1",
    capabilityId: TEST_CAPABILITY_ID,
    selectedProviderId: providerId,
    selectedModelId: "test-model",
    executionProfile: {
      executionMode: "sequential",
      priority: "normal",
      retryPolicy: NO_RETRY_POLICY,
      timeoutPolicy: { executionTimeoutMs: 30_000 },
      streaming: false,
      humanReviewRequired: false,
      evaluationEnabled: true,
    },
    negotiatedFeatures: [],
    rejectedFeatures: [],
    negotiatedConstraints: [],
    negotiatedBudget: { withinBudget: true, reasons: [] },
    regional: { allowed: true, providerRegions: ["us-east-1"], reasons: [] },
    quality: {
      satisfied: true,
      humanReviewRequired: false,
      riskLevel: "low",
      reasons: [],
    },
    fallbackCandidates: [],
    warnings: [],
    confidence: 1,
    evidence: [],
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

export interface AdapterTestHarness {
  readonly platform: AdapterPlatform;
  readonly adapter: FakeTextAdapter;
}

export function setupAdapterPlatform(
  adapter: FakeTextAdapter = new FakeTextAdapter()
): AdapterTestHarness {
  const platform = createAdapterPlatform({ nowIso: fixedNow, createId: fixedId });
  const registered = platform.registry.register(adapter);
  if (!registered.ok) {
    throw registered.error;
  }
  return { platform, adapter };
}
