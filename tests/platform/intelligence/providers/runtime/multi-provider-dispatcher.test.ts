import { createProviderRuntime } from "../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-response";
import type { CancellationToken } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { success, failure, type Result } from "../../../../../src/platform/intelligence/shared/result";
import { asCapabilityId, asProviderId, asExecutionId, asOrganizationId, asWorkspaceId } from "../../../../../src/platform/intelligence/shared/identifiers";
import type { IProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/interfaces/provider-dispatcher";
import {
  InMemoryProviderRuntimeRegistry,
} from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { createOpenAIProvider } from "../../../../../src/platform/intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../../../../src/platform/intelligence/providers/openai/constants";

class CountingDispatcher implements IProviderDispatcher {
  public readonly attemptsByRequestId = new Map<string, number>();

  constructor(
    private readonly supportedStreaming: boolean,
    private readonly responseOutput: Readonly<Record<string, unknown>>
  ) {}

  supportsStreaming(_providerId: any): boolean {
    return this.supportedStreaming;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    const n = this.attemptsByRequestId.get(request.requestId) ?? 0;
    this.attemptsByRequestId.set(request.requestId, n + 1);

    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: this.responseOutput,
      usage: { tokens: 0 },
      providerRequestId: `fake_${request.requestId}`,
      streamed: request.streaming,
      finishedAt: new Date().toISOString(),
    });
  }
}

function buildRequest(
  overrides: Partial<{
    requestId: string;
    providerId: string;
    capabilityId: string;
    modelId: string;
  }> = {}
): ProviderExecutionRequest {
  const base = sampleRequest({
    requestId: overrides.requestId ?? "req_1",
    providerId: overrides.providerId ?? "provider-a",
  });

  return {
    ...base,
    requestId: overrides.requestId ?? base.requestId,
    providerId: asProviderId(overrides.providerId ?? String(base.providerId)),
    capabilityId: asCapabilityId(overrides.capabilityId ?? "cap-text-generate"),
    modelId: overrides.modelId ?? "model-1",
    context: {
      ...base.context,
      providerId: asProviderId(overrides.providerId ?? String(base.context.providerId)),
      executionId: asExecutionId(base.context.executionId),
      organizationId: asOrganizationId(base.context.organizationId),
      workspaceId: asWorkspaceId(base.context.workspaceId),
    },
  };
}

describe("M9.5A MultiProviderDispatcher", () => {
  it("dispatches to the registered executable provider only", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();

    const providerA = asProviderId("provider-a");
    const providerB = asProviderId("provider-b");

    const dispA = new CountingDispatcher(false, { from: "A" });
    const dispB = new CountingDispatcher(false, { from: "B" });

    registry.registerExecutable({
      providerId: providerA,
      dispatcher: dispA,
      capabilities: ["cap-1"],
      status: "available",
    });
    registry.registerExecutable({
      providerId: providerB,
      dispatcher: dispB,
      capabilities: ["cap-1"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: {
        supportsModelCapability: () => true,
      },
    });

    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
    });

    const request = buildRequest({
      requestId: "r1",
      providerId: "provider-b",
      capabilityId: "cap-1",
      modelId: "model-b1",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.success).toBe(true);
    expect(dispA.attemptsByRequestId.get("r1") ?? 0).toBe(0);
    expect(dispB.attemptsByRequestId.get("r1") ?? 0).toBe(1);
    expect(result.value.response?.providerId).toBe(request.providerId);

    await runtime.dispose();
  });

  it("fails clearly for an unknown/non-executable providerId (no fallback)", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const openaiLike = asProviderId("provider.openai");

    const dispOpenAI = new CountingDispatcher(false, { from: "OpenAI" });
    registry.registerExecutable({
      providerId: openaiLike,
      dispatcher: dispOpenAI,
      capabilities: ["text.generate"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    const request = buildRequest({
      requestId: "unknown_provider",
      providerId: "provider-not-registered",
      capabilityId: "text.generate",
      modelId: "gpt-4o",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.success).toBe(false);
    expect(dispOpenAI.attemptsByRequestId.get("unknown_provider") ?? 0).toBe(0);

    await runtime.dispose();
  });

  it("rejects unsupported provider capability before dispatch", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const providerB = asProviderId("provider-b");

    const dispB = new CountingDispatcher(false, { from: "B" });
    registry.registerExecutable({
      providerId: providerB,
      dispatcher: dispB,
      capabilities: ["cap-allowed"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const request = buildRequest({
      requestId: "cap_mismatch_provider",
      providerId: "provider-b",
      capabilityId: "cap-not-allowed",
      modelId: "model-b1",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(dispB.attemptsByRequestId.get("cap_mismatch_provider") ?? 0).toBe(0);

    await runtime.dispose();
  });

  it("rejects unsupported model capability before dispatch", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const providerB = asProviderId("provider-b");

    const dispB = new CountingDispatcher(false, { from: "B" });
    registry.registerExecutable({
      providerId: providerB,
      dispatcher: dispB,
      capabilities: ["cap-allowed"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => false },
    });

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const request = buildRequest({
      requestId: "cap_mismatch_model",
      providerId: "provider-b",
      capabilityId: "cap-allowed",
      modelId: "model-not-compatible",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);
    expect(dispB.attemptsByRequestId.get("cap_mismatch_model") ?? 0).toBe(0);

    await runtime.dispose();
  });

  it("treats catalogue-only providers as non-executable", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const providerC = asProviderId("provider-c");

    registry.registerCatalogued(providerC, ["cap-1"]);

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const request = buildRequest({
      requestId: "catalogue_only",
      providerId: "provider-c",
      capabilityId: "cap-1",
      modelId: "model-c1",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(false);

    await runtime.dispose();
  });

  it(
    "runs OpenAI via MultiProviderDispatcher (simulated HTTP, no pinned dispatcher)",
    async () => {
    const modelRegistry = createModelRegistryPlatform({
      nowIso: () => new Date().toISOString(),
      loadSeed: true,
    });

    const registry = new InMemoryProviderRuntimeRegistry();
    const canonicalOpenAI = asProviderId("provider.openai");

    const providerModels = modelRegistry.registry.listModels(canonicalOpenAI);
    if (!providerModels.ok) throw providerModels.error;
    const providerCapabilitiesSet = new Set<string>();
    for (const model of providerModels.value) {
      for (const c of model.capabilities) {
        if (c.supported) providerCapabilitiesSet.add(c.capabilityId);
      }
    }
    const providerCapabilities = Array.from(providerCapabilitiesSet);

    const openai = await createOpenAIProvider({
      mode: "simulated",
      skipCertification: true,
    });
    if (!openai.ok) throw openai.error;

    registry.registerExecutable({
      providerId: canonicalOpenAI,
      dispatcher: openai.value.dispatcher,
      capabilities: providerCapabilities,
      status: "available",
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      // Real model capability enforcement using the seed model registry.
      modelCapabilityResolver: {
        supportsModelCapability: (modelId, capabilityId) => {
          const model = modelRegistry.registry.getModel(modelId);
          if (!model.ok) return false;
          return model.value.capabilities.some(
            (c) => c.capabilityId === capabilityId && c.supported
          );
        },
      },
    });

    const fetchFn = (globalThis as any).fetch;
    const fetchSpy =
      typeof fetchFn === "function"
        ? jest
            .spyOn(globalThis as any, "fetch")
            .mockImplementation(() => {
              throw new Error("fetch called");
            })
        : undefined;

    const runtime = createProviderRuntime({
      dispatcher,
      sleep: () => Promise.resolve(),
    });

    const request = buildRequest({
      requestId: "openai_m9_5a",
      providerId: "provider.openai",
      capabilityId: "text.generate",
      modelId: "openai/gpt-4o",
    });

    const result = await runtime.execute(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(result.value.response?.providerId).toBe(request.providerId);

    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }

    const lastArtifacts =
      "getLastArtifacts" in openai.value.dispatcher
        ? openai.value.dispatcher.getLastArtifacts()
        : undefined;
    if (lastArtifacts?.executionArtifact?.modelId) {
      expect(lastArtifacts.executionArtifact.modelId).toBe("openai/gpt-4o");
    }

    await runtime.dispose();
    },
    30000
  );
});

