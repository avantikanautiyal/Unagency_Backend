/**
 * M9.5K — Embeddings runtime certification (offline).
 * Zero external network / AI calls.
 */

import { createProviderRuntime } from "../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import {
  asCapabilityId,
  asProviderId,
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import { InMemoryProviderRuntimeRegistry } from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { createOpenAIProvider } from "../../../../../src/platform/intelligence/providers/openai/factories/create-openai-provider";
import { createCohereProvider } from "../../../../../src/platform/intelligence/providers/cohere/factories/create-cohere-provider";
import { createCompatTextProvider } from "../../../../../src/platform/intelligence/providers/compat/factories/create-compat-text-provider";
import { MISTRAL_CONFIG } from "../../../../../src/platform/intelligence/providers/compat/configs/text-provider-configs";
import { registerTextProviders } from "../../../../../src/platform/production/execution/register-text-providers";
import { FailoverOrchestrator } from "../../../../../src/platform/intelligence/providers/routing/performance/failover/failover-orchestrator";
import { loadProviderFailoverConfig } from "../../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";
import {
  mapOpenAICompatibleEmbeddingData,
  validateEmbeddingVector,
} from "../../../../../src/platform/intelligence/providers/common/embedding-output";
import { evaluateEmbeddingReadiness } from "../../../../../src/platform/production/execution/embedding-provider-env";
import {
  EMBEDDING_EXECUTABLE_PROVIDER_IDS,
  GEMINI_EMBEDDING_SPEC,
} from "../../../../../src/platform/intelligence/providers/embedding/configs/verified-embedding-provider-specs";
import { ProviderError } from "../../../../../src/platform/intelligence/shared/errors";
import * as fs from "fs";
import * as path from "path";

function buildEmbeddingRequest(overrides: {
  requestId?: string;
  providerId: string;
  modelId: string;
  payload?: Record<string, unknown>;
  organizationId?: string;
}): ProviderExecutionRequest {
  const org = overrides.organizationId ?? "org_embed";
  const base = sampleRequest({
    requestId: overrides.requestId ?? "req_embed",
    providerId: overrides.providerId,
  });
  return {
    ...base,
    requestId: overrides.requestId ?? base.requestId,
    providerId: asProviderId(overrides.providerId),
    capabilityId: asCapabilityId("embedding.generate"),
    modelId: overrides.modelId,
    payload:
      overrides.payload ??
      ({ text: "UNAGENCY embedding runtime certification." } as Record<string, unknown>),
    context: {
      ...base.context,
      providerId: asProviderId(overrides.providerId),
      organizationId: asOrganizationId(org),
      workspaceId: asWorkspaceId(base.context.workspaceId),
      executionId: asExecutionId(base.context.executionId),
    },
  };
}

describe("M9.5K embeddings runtime certification", () => {
  it("OpenAI embedding.generate returns canonical finite vector", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["embedding.generate", "text.generate"],
      status: "available",
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });
    const result = await runtime.execute(
      buildEmbeddingRequest({
        providerId: "provider.openai",
        modelId: "openai/text-embedding-3-large",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    const embedding = (result.value.response?.output as Record<string, unknown>)?.embedding as
      | Record<string, unknown>
      | undefined;
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding?.vector)).toBe(true);
    expect(embedding?.dimensions).toBe((embedding?.vector as number[]).length);
    expect(embedding?.provider).toBe("provider.openai");
    await runtime.dispose();
  });

  it("rejects empty embedding input", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["embedding.generate"],
      status: "available",
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });
    const result = await runtime.execute(
      buildEmbeddingRequest({
        providerId: "provider.openai",
        modelId: "openai/text-embedding-3-large",
        payload: { text: "   " },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("rejects non-embedding OpenAI model for embedding.generate", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["embedding.generate", "text.generate"],
      status: "available",
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });
    const result = await runtime.execute(
      buildEmbeddingRequest({
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("rejects malformed embedding vectors", () => {
    expect(validateEmbeddingVector([]).ok).toBe(false);
    expect(validateEmbeddingVector([1, NaN]).ok).toBe(false);
    expect(validateEmbeddingVector([1, Infinity]).ok).toBe(false);
    expect(validateEmbeddingVector([0.1, 0.2]).ok).toBe(true);
    const mapped = mapOpenAICompatibleEmbeddingData({
      data: [{ embedding: [1, 2, 3], index: 0 }],
      model: "m",
      provider: "p",
    });
    expect(mapped.ok).toBe(true);
  });

  it("Cohere embedding.generate uses /v2/embed contract", async () => {
    const cohere = createCohereProvider({ mode: "simulated" });
    if (!cohere.ok) throw cohere.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.cohere"),
      dispatcher: cohere.value.dispatcher,
      capabilities: ["embedding.generate"],
      status: "available",
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });
    const result = await runtime.execute(
      buildEmbeddingRequest({
        providerId: "provider.cohere",
        modelId: "cohere/embed-english-v3.0",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    const embedding = (result.value.response?.output as Record<string, unknown>)?.embedding as
      | Record<string, unknown>
      | undefined;
    expect(embedding?.dimensions).toBeGreaterThan(0);
    await runtime.dispose();
  });

  it("Mistral embedding.generate via OpenAI-compatible /embeddings", async () => {
    const mistral = createCompatTextProvider({ config: MISTRAL_CONFIG, mode: "simulated" });
    if (!mistral.ok) throw mistral.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.mistral"),
      dispatcher: mistral.value.dispatcher,
      capabilities: ["embedding.generate"],
      status: "available",
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });
    const result = await runtime.execute(
      buildEmbeddingRequest({
        providerId: "provider.mistral",
        modelId: "mistral/mistral-embed",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    await runtime.dispose();
  });

  it("registerTextProviders does not advertise Gemini embedding.generate as executable", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const registered = await registerTextProviders({
      executionMode: "openai_simulated",
      modelRegistry: modelRegistry.registry,
      registry,
    });
    expect(registered.ok).toBe(true);
    const gemini = registry.resolveAvailable(asProviderId("provider.gemini"));
    expect(gemini?.capabilities.includes("embedding.generate") ?? false).toBe(false);
    const openai = registry.resolveAvailable(asProviderId("provider.openai"));
    expect(openai?.capabilities.includes("embedding.generate")).toBe(true);
    const cohere = registry.resolveAvailable(asProviderId("provider.cohere"));
    expect(cohere?.capabilities.includes("embedding.generate")).toBe(true);
    const mistral = registry.resolveAvailable(asProviderId("provider.mistral"));
    expect(mistral?.capabilities.includes("embedding.generate")).toBe(true);
    expect(GEMINI_EMBEDDING_SPEC.vendorApiVerified).toBe(false);
    expect(EMBEDDING_EXECUTABLE_PROVIDER_IDS.has("provider.gemini")).toBe(false);
  });

  it("embedding failover: OpenAI rate limit → Cohere success", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const cohere = createCohereProvider({
      mode: "simulated",
      httpClient: {
        async send() {
          return {
            ok: true as const,
            value: {
              status: 200,
              headers: {},
              body: {
                id: "ok",
                embeddings: { float: [[0.5, 0.6, 0.7]] },
                meta: { billed_units: { input_tokens: 3 } },
              },
              latencyMs: 5,
            },
          };
        },
      },
    });
    if (!cohere.ok) throw cohere.error;

    // Wrap OpenAI dispatcher to fail with rate limit
    const failingOpenAI = {
      supportsStreaming: () => false,
      dispatch: async () => ({
        ok: false as const,
        error: new ProviderError("rate limited", { status: 429 }),
      }),
    };

    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: failingOpenAI as never,
      capabilities: ["embedding.generate"],
      status: "available",
    });
    registry.registerExecutable({
      providerId: asProviderId("provider.cohere"),
      dispatcher: cohere.value.dispatcher,
      capabilities: ["embedding.generate"],
      status: "available",
    });

    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });

    const failover = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({ PROVIDER_FAILOVER_ENABLED: "true" }),
      createId: (p) => `${p}_emb`,
    });

    const out = await failover.executeCandidates(
      buildEmbeddingRequest({
        providerId: "provider.openai",
        modelId: "openai/text-embedding-3-large",
      }),
      [
        {
          providerId: "provider.openai",
          modelId: "openai/text-embedding-3-large",
          primaryOrFailover: "primary",
          positionInRoute: 0,
        },
        {
          providerId: "provider.cohere",
          modelId: "cohere/embed-english-v3.0",
          primaryOrFailover: "failover",
          positionInRoute: 1,
        },
      ]
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.result.success).toBe(true);
    expect(String(out.value.finalProviderId)).toBe("provider.cohere");
    await runtime.dispose();
  });

  it("embedding readiness reports inventory/verified/configured/executable", () => {
    const r = evaluateEmbeddingReadiness({});
    expect(r.embeddingProvidersInventory).toBeGreaterThanOrEqual(4);
    expect(r.embeddingProvidersVerified).toBe(3);
    expect(r.embeddingProvidersExecutable).toBe(0);
  });

  it("Knowledge/Studio/business paths do not hardcode embedding vendor endpoints", () => {
    // tests/platform/intelligence/providers/embedding → unagency-backend
    const repoRoot = path.resolve(__dirname, "../../../../../");
    const forbidden = [
      "src/platform/business",
      "src/platform/studio",
      "src/platform/intelligence/knowledge",
      "src/platform/intelligence/agent-planning",
      "src/platform/api/controllers",
    ];
    const patterns = [/\/v1\/embeddings/, /\/v2\/embed/, /:embedContent/];
    const offenders: string[] = [];
    for (const rel of forbidden) {
      const target = path.join(repoRoot, rel);
      if (!fs.existsSync(target)) continue;
      walk(target, (file, content) => {
        if (!file.endsWith(".ts")) return;
        if (patterns.some((p) => p.test(content))) {
          offenders.push(path.relative(repoRoot, file));
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("offline full-path: capabilityHint → Model Intelligence → runtime → vector", async () => {
    const { bootProductionExecution } = await import(
      "../../../../../src/platform/production/execution/production-executor"
    );
    const { seedExecutionContextFixtures } = await import(
      "../../../../../src/platform/business/execution-context/testing/seed-fixtures"
    );
    const { asOrganizationId, asWorkspaceId } = await import(
      "../../../../../src/platform/intelligence/shared/identifiers"
    );

    const boot = await bootProductionExecution({
      mode: "openai_simulated",
      organizationId: "org_1",
      workspaceId: "ws_1",
      executionContextStores: seedExecutionContextFixtures({
        organizationId: "org_1",
        userId: "ios_test_user",
        organizationName: "Embedding Cert Org",
        brand: {
          brandId: "brand_org_1",
          name: "Embedding Brand",
          toneOfVoice: "precise",
        },
      }),
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;

    const run = await boot.value.integration.run({
      requestId: "emb_e2e_1",
      rawPrompt: "UNAGENCY embedding runtime certification.",
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      budgetLimit: 500,
      tokenBudgetLimit: 200_000,
      correlationId: "corr_emb_e2e",
      mode: "full",
      metadata: {
        userId: "ios_test_user",
        brandId: "brand_org_1",
        capabilityHint: "embedding.generate",
        capabilityId: "embedding.generate",
      },
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.value.success).toBe(true);
    expect(String(run.value.artifacts.task?.capabilityMap.primary)).toBe(
      "embedding.generate"
    );
    const output = run.value.artifacts.runtime?.response?.output as
      | Record<string, unknown>
      | undefined;
    const embedding = output?.embedding as Record<string, unknown> | undefined;
    expect(Array.isArray(embedding?.vector)).toBe(true);
    expect((embedding?.vector as number[]).length).toBeGreaterThan(0);
    expect(run.value.stagesCompleted).toContain("provider_runtime");
    expect(run.value.stagesCompleted).toContain("execution_intelligence");
  }, 60_000);
});

function walk(target: string, visit: (file: string, content: string) => void): void {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    visit(target, fs.readFileSync(target, "utf8"));
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    walk(path.join(target, entry.name), visit);
  }
}
