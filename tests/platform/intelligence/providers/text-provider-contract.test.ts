/**
 * M9.5B — reusable contract tests for executable text providers.
 */

import { createProviderRuntime } from "../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { CancellationToken } from "../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { sampleRequest } from "../../../../src/platform/intelligence/providers/runtime/testing";
import {
  asCapabilityId,
  asProviderId,
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../../../src/platform/intelligence/shared/identifiers";
import type { IProviderDispatcher } from "../../../../src/platform/intelligence/providers/runtime/interfaces/provider-dispatcher";
import {
  InMemoryProviderRuntimeRegistry,
} from "../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { createModelRegistryPlatform } from "../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { createCompatTextProvider } from "../../../../src/platform/intelligence/providers/compat/factories/create-compat-text-provider";
import { GROQ_CONFIG } from "../../../../src/platform/intelligence/providers/compat/configs/text-provider-configs";
import { createAnthropicProvider } from "../../../../src/platform/intelligence/providers/anthropic/factories/create-anthropic-provider";
import { createGeminiProvider } from "../../../../src/platform/intelligence/providers/gemini/factories/create-gemini-provider";
import { createOpenAIProvider } from "../../../../src/platform/intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../../../src/platform/intelligence/providers/openai/constants";
import { ProviderError } from "../../../../src/platform/intelligence/shared/errors";
import { SimulatedCompatHttpClient } from "../../../../src/platform/intelligence/providers/compat/http/simulated-compat-http-client";
import { SimulatedAnthropicHttpClient } from "../../../../src/platform/intelligence/providers/anthropic/http/simulated-anthropic-http-client";
import { SimulatedGeminiHttpClient } from "../../../../src/platform/intelligence/providers/gemini/http/gemini-http-client";

export function buildTextProviderRequest(overrides: {
  requestId?: string;
  providerId: string;
  capabilityId?: string;
  modelId: string;
}): ProviderExecutionRequest {
  const base = sampleRequest({
    requestId: overrides.requestId ?? "req_contract",
    providerId: overrides.providerId,
  });
  return {
    ...base,
    requestId: overrides.requestId ?? base.requestId,
    providerId: asProviderId(overrides.providerId),
    capabilityId: asCapabilityId(overrides.capabilityId ?? "text.generate"),
    modelId: overrides.modelId,
    context: {
      ...base.context,
      providerId: asProviderId(overrides.providerId),
      executionId: asExecutionId(base.context.executionId),
      organizationId: asOrganizationId(base.context.organizationId),
      workspaceId: asWorkspaceId(base.context.workspaceId),
    },
  };
}

export async function runTextProviderContract(input: {
  name: string;
  providerId: string;
  modelId: string;
  dispatcher: IProviderDispatcher;
  capabilities: readonly string[];
  wrongModelId?: string;
  injectRateLimit?: boolean;
}): Promise<void> {
  const registry = new InMemoryProviderRuntimeRegistry();
  const modelRegistry = createModelRegistryPlatform({ loadSeed: true });

  registry.registerExecutable({
    providerId: asProviderId(input.providerId),
    dispatcher: input.dispatcher,
    capabilities: input.capabilities,
    status: "available",
    dispatcherSupportsStreamingProviderId:
      input.providerId === "provider.openai"
        ? asProviderId(OPENAI_PROVIDER_ID)
        : undefined,
  });

  const dispatcher = new MultiProviderDispatcher({
    registry,
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

  const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

  const fetchSpy =
    typeof (globalThis as any).fetch === "function"
      ? jest.spyOn(globalThis as any, "fetch").mockImplementation(() => {
          throw new Error("fetch called");
        })
      : undefined;

  const request = buildTextProviderRequest({
    requestId: `contract_${input.name}`,
    providerId: input.providerId,
    modelId: input.modelId,
  });

  const result = await runtime.execute(request);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.success).toBe(true);
  expect(result.value.response?.providerId).toBe(request.providerId);
  expect(result.value.response?.output).toBeDefined();

  const usage = result.value.response?.usage as Record<string, unknown> | undefined;
  if (usage) {
    expect(
      usage.promptTokens !== undefined ||
        usage.completionTokens !== undefined ||
        usage.totalTokens !== undefined ||
        usage.tokens !== undefined
    ).toBe(true);
  }

  if (input.wrongModelId) {
    const bad = buildTextProviderRequest({
      requestId: `bad_model_${input.name}`,
      providerId: input.providerId,
      modelId: input.wrongModelId,
    });
    const badResult = await runtime.execute(bad);
    expect(badResult.ok).toBe(true);
    if (badResult.ok) expect(badResult.value.success).toBe(false);
  }

  if (fetchSpy) {
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  }

  await runtime.dispose();
}

describe("M9.5B text provider contract suite", () => {
  it("OpenAI accepts canonical request and preserves identity", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    await runTextProviderContract({
      name: "openai",
      providerId: "provider.openai",
      modelId: "openai/gpt-4o",
      dispatcher: openai.value.dispatcher,
      capabilities: ["text.generate", "text.chat"],
      wrongModelId: "openai/not-a-real-model",
    });
  });

  it("Anthropic normalizes response and rejects foreign models", async () => {
    const anthropic = createAnthropicProvider({ mode: "simulated" });
    if (!anthropic.ok) throw anthropic.error;
    await runTextProviderContract({
      name: "anthropic",
      providerId: "provider.anthropic",
      modelId: "anthropic/claude-3-5-sonnet",
      dispatcher: anthropic.value.dispatcher,
      capabilities: ["text.generate", "text.chat", "reasoning.analyze"],
      wrongModelId: "anthropic/gpt-4o",
    });
  });

  it("Gemini normalizes usage and preserves provider id", async () => {
    const gemini = createGeminiProvider({ mode: "simulated" });
    if (!gemini.ok) throw gemini.error;
    await runTextProviderContract({
      name: "gemini",
      providerId: "provider.gemini",
      modelId: "gemini/gemini-2.0-flash",
      dispatcher: gemini.value.dispatcher,
      capabilities: ["text.generate", "text.chat"],
      wrongModelId: "gemini/claude-3-opus",
    });
  });

  it("Groq compat leaf preserves Groq identity (not OpenAI)", async () => {
    const groq = createCompatTextProvider({ config: GROQ_CONFIG, mode: "simulated" });
    if (!groq.ok) throw groq.error;
    await runTextProviderContract({
      name: "groq",
      providerId: "provider.groq",
      modelId: "groq/llama-3.3-70b-versatile",
      dispatcher: groq.value.dispatcher,
      capabilities: ["text.generate", "text.chat"],
      wrongModelId: "groq/gpt-4o",
    });
  });
});

describe("M9.5B provider failure normalization", () => {
  it("surfaces Anthropic rate limit through runtime without leaf fallback", async () => {
    const http = new SimulatedAnthropicHttpClient(() => Date.now(), () =>
      new ProviderError("rate limit exceeded", { status: 429 })
    );
    const anthropic = createAnthropicProvider({ mode: "simulated", httpClient: http });
    if (!anthropic.ok) throw anthropic.error;

    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.anthropic"),
      dispatcher: anthropic.value.dispatcher,
      capabilities: ["text.generate"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    const result = await runtime.execute(
      buildTextProviderRequest({
        requestId: "anthropic_rl",
        providerId: "provider.anthropic",
        modelId: "anthropic/claude-3-5-sonnet",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("surfaces Groq auth failure without invoking other providers", async () => {
    const http = new SimulatedCompatHttpClient(GROQ_CONFIG, () => Date.now(), () =>
      new ProviderError("invalid api key", { status: 401 })
    );
    const groq = createCompatTextProvider({
      config: GROQ_CONFIG,
      mode: "simulated",
      httpClient: http,
    });
    if (!groq.ok) throw groq.error;

    const registry = new InMemoryProviderRuntimeRegistry();
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;

    registry.registerExecutable({
      providerId: asProviderId("provider.groq"),
      dispatcher: groq.value.dispatcher,
      capabilities: ["text.generate"],
      status: "available",
    });
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["text.generate"],
      status: "available",
    });

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    const result = await runtime.execute(
      buildTextProviderRequest({
        requestId: "groq_auth",
        providerId: "provider.groq",
        modelId: "groq/llama-3.3-70b-versatile",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });
});

describe("M9.5B multi-provider activation", () => {
  it("routes three providers to distinct leaves with zero fetch calls", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();

    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    const anthropic = createAnthropicProvider({ mode: "simulated" });
    const gemini = createGeminiProvider({
      mode: "simulated",
      httpClient: new SimulatedGeminiHttpClient(),
    });
    if (!openai.ok || !anthropic.ok || !gemini.ok) {
      throw new Error("provider boot failed");
    }

    const plans = [
      {
        providerId: "provider.openai",
        modelId: "openai/gpt-4o",
        dispatcher: openai.value.dispatcher,
        streamingId: asProviderId(OPENAI_PROVIDER_ID),
      },
      {
        providerId: "provider.anthropic",
        modelId: "anthropic/claude-3-5-sonnet",
        dispatcher: anthropic.value.dispatcher,
      },
      {
        providerId: "provider.gemini",
        modelId: "gemini/gemini-2.0-flash",
        dispatcher: gemini.value.dispatcher,
      },
    ] as const;

    for (const plan of plans) {
      const caps = modelRegistry.registry.listModels(asProviderId(plan.providerId));
      if (!caps.ok) throw caps.error;
      const capIds = Array.from(
        new Set(
          caps.value.flatMap((m) =>
            m.capabilities.filter((c) => c.supported).map((c) => c.capabilityId)
          )
        )
      );
      registry.registerExecutable({
        providerId: asProviderId(plan.providerId),
        dispatcher: plan.dispatcher,
        capabilities: capIds,
        status: "available",
        dispatcherSupportsStreamingProviderId:
          "streamingId" in plan ? plan.streamingId : undefined,
      });
    }

    const dispatcher = new MultiProviderDispatcher({
      registry,
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

    const fetchSpy =
      typeof (globalThis as any).fetch === "function"
        ? jest.spyOn(globalThis as any, "fetch").mockImplementation(() => {
            throw new Error("fetch called");
          })
        : undefined;

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    for (const plan of plans) {
      const result = await runtime.execute(
        buildTextProviderRequest({
          requestId: `multi_${plan.providerId}`,
          providerId: plan.providerId,
          modelId: plan.modelId,
        })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.success).toBe(true);
      expect(String(result.value.response?.providerId)).toBe(plan.providerId);
    }

    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }

    await runtime.dispose();
  });
});
