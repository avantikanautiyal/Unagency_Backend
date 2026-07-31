/**
 * M9.5C — image generation, vision, and cross-modal routing tests.
 * Zero external network calls.
 */

import { createProviderRuntime } from "../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { ProviderExecutionResponse } from "../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-response";
import type { CancellationToken } from "../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { sampleRequest } from "../../../../src/platform/intelligence/providers/runtime/testing";
import { success, type Result } from "../../../../src/platform/intelligence/shared/result";
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
import { createOpenAIProvider } from "../../../../src/platform/intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../../../src/platform/intelligence/providers/openai/constants";
import { createAnthropicProvider } from "../../../../src/platform/intelligence/providers/anthropic/factories/create-anthropic-provider";
import { createGeminiProvider } from "../../../../src/platform/intelligence/providers/gemini/factories/create-gemini-provider";
import { createCompatTextProvider } from "../../../../src/platform/intelligence/providers/compat/factories/create-compat-text-provider";
import { GROQ_CONFIG, XAI_CONFIG } from "../../../../src/platform/intelligence/providers/compat/configs/text-provider-configs";
import { ProviderError } from "../../../../src/platform/intelligence/shared/errors";
import { buildTextProviderRequest } from "./text-provider-contract.test";

class FakeImageDispatcher implements IProviderDispatcher {
  constructor(
    private readonly providerId: string,
    private readonly tag: string
  ) {}

  supportsStreaming(): boolean {
    return false;
  }

  async dispatch(
    request: ProviderExecutionRequest,
    _token: CancellationToken
  ): Promise<Result<ProviderExecutionResponse>> {
    return success({
      requestId: request.requestId,
      providerId: request.providerId,
      output: {
        outputs: [
          {
            type: "image",
            mimeType: "image/png",
            url: `https://example.local/${this.tag}/${request.modelId}.png`,
            metadata: { provider: this.tag },
          },
        ],
      },
      usage: { imagesGenerated: 1 },
      providerRequestId: `fake_img_${this.tag}`,
      streamed: false,
      finishedAt: new Date().toISOString(),
    });
  }
}

function buildMediaRequest(overrides: {
  requestId?: string;
  providerId: string;
  capabilityId: string;
  modelId: string;
  payload?: Record<string, unknown>;
  organizationId?: string;
}): ProviderExecutionRequest {
  const org = overrides.organizationId ?? "org_test";
  const base = sampleRequest({
    requestId: overrides.requestId ?? "req_media",
    providerId: overrides.providerId,
  });
  return {
    ...base,
    requestId: overrides.requestId ?? base.requestId,
    providerId: asProviderId(overrides.providerId),
    capabilityId: asCapabilityId(overrides.capabilityId),
    modelId: overrides.modelId,
    payload: overrides.payload ?? { prompt: "A red circle on white background" },
    context: {
      ...base.context,
      providerId: asProviderId(overrides.providerId),
      organizationId: asOrganizationId(org),
      workspaceId: asWorkspaceId(base.context.workspaceId),
      executionId: asExecutionId(base.context.executionId),
    },
  };
}

describe("M9.5C image & vision provider activation", () => {
  it("OpenAI image.generate routes to images API and normalizes media outputs", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;

    const caps = modelRegistry.registry.listModels(asProviderId("provider.openai"));
    if (!caps.ok) throw caps.error;
    const capIds = Array.from(
      new Set(
        caps.value.flatMap((m) =>
          m.capabilities.filter((c) => c.supported).map((c) => c.capabilityId)
        )
      )
    );

    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: capIds,
      status: "available",
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
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

    const fetchSpy =
      typeof (globalThis as any).fetch === "function"
        ? jest.spyOn(globalThis as any, "fetch").mockImplementation(() => {
            throw new Error("fetch called");
          })
        : undefined;

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });
    const result = await runtime.execute(
      buildMediaRequest({
        requestId: "openai_dalle",
        providerId: "provider.openai",
        capabilityId: "image.generate",
        modelId: "openai/dall-e-3",
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    const outputs = (result.value.response?.output as Record<string, unknown>)?.outputs;
    expect(Array.isArray(outputs)).toBe(true);
    expect((outputs as unknown[]).length).toBeGreaterThan(0);

    if (fetchSpy) {
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }
    await runtime.dispose();
  });

  it("rejects OpenAI image.generate with text-only model before dispatch", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["image.generate", "text.generate"],
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
      buildMediaRequest({
        requestId: "openai_wrong_model",
        providerId: "provider.openai",
        capabilityId: "image.generate",
        modelId: "openai/gpt-4o",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("vision.analyze on Anthropic, Gemini, and xAI with tenant-scoped assets", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();

    const anthropic = createAnthropicProvider({ mode: "simulated" });
    const gemini = createGeminiProvider({ mode: "simulated" });
    const xai = createCompatTextProvider({ config: XAI_CONFIG, mode: "simulated" });
    if (!anthropic.ok || !gemini.ok || !xai.ok) throw new Error("provider boot failed");

    const providers = [
      { id: "provider.anthropic", disp: anthropic.value.dispatcher, model: "anthropic/claude-3-5-sonnet" },
      { id: "provider.gemini", disp: gemini.value.dispatcher, model: "gemini/gemini-2.0-flash" },
      { id: "provider.xai", disp: xai.value.dispatcher, model: "xai/grok-2" },
    ] as const;

    for (const p of providers) {
      const caps = modelRegistry.registry.listModels(asProviderId(p.id));
      if (!caps.ok) throw caps.error;
      const capIds = Array.from(
        new Set(
          caps.value.flatMap((m) =>
            m.capabilities.filter((c) => c.supported).map((c) => c.capabilityId)
          )
        )
      );
      registry.registerExecutable({
        providerId: asProviderId(p.id),
        dispatcher: p.disp,
        capabilities: capIds,
        status: "available",
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

    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    for (const p of providers) {
      const result = await runtime.execute(
        buildMediaRequest({
          requestId: `vision_${p.id}`,
          providerId: p.id,
          capabilityId: "vision.analyze",
          modelId: p.model,
          organizationId: "org_vision_test",
          payload: {
            prompt: "What is in this image?",
            assets: [
              {
                base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                organizationId: "org_vision_test",
                mimeType: "image/png",
              },
            ],
          },
        })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.success).toBe(true);
      const content = (result.value.response?.output as Record<string, unknown>)?.content;
      expect(String(content)).toContain("vision");
    }

    await runtime.dispose();
  });

  it("rejects cross-tenant input asset references", async () => {
    const anthropic = createAnthropicProvider({ mode: "simulated" });
    if (!anthropic.ok) throw anthropic.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.anthropic"),
      dispatcher: anthropic.value.dispatcher,
      capabilities: ["vision.analyze"],
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
      buildMediaRequest({
        requestId: "cross_tenant_asset",
        providerId: "provider.anthropic",
        capabilityId: "vision.analyze",
        modelId: "anthropic/claude-3-5-sonnet",
        organizationId: "org_a",
        payload: {
          prompt: "Describe",
          assets: [{ url: "https://x/y.png", organizationId: "org_b" }],
        },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("cross-modal routing: text vs vision vs image generation", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();

    const groq = createCompatTextProvider({ config: GROQ_CONFIG, mode: "simulated" });
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    const anthropic = createAnthropicProvider({ mode: "simulated" });
    if (!groq.ok || !openai.ok || !anthropic.ok) throw new Error("boot failed");

    registry.registerExecutable({
      providerId: asProviderId("provider.groq"),
      dispatcher: groq.value.dispatcher,
      capabilities: ["text.generate"],
      status: "available",
    });
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["text.generate", "image.generate"],
      status: "available",
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
    });
    registry.registerExecutable({
      providerId: asProviderId("provider.anthropic"),
      dispatcher: anthropic.value.dispatcher,
      capabilities: ["text.generate", "vision.analyze"],
      status: "available",
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

    const textResult = await runtime.execute(
      buildTextProviderRequest({
        requestId: "cross_text",
        providerId: "provider.groq",
        capabilityId: "text.generate",
        modelId: "groq/llama-3.3-70b-versatile",
      })
    );
    expect(textResult.ok).toBe(true);
    if (textResult.ok) expect(textResult.value.success).toBe(true);

    const visionResult = await runtime.execute(
      buildMediaRequest({
        requestId: "cross_vision",
        providerId: "provider.anthropic",
        capabilityId: "vision.analyze",
        modelId: "anthropic/claude-3-5-sonnet",
        payload: {
          prompt: "Describe",
          assets: [{ url: "https://example.local/a.png", organizationId: "org_test" }],
        },
      })
    );
    expect(visionResult.ok).toBe(true);
    if (visionResult.ok) expect(visionResult.value.success).toBe(true);

    const imageResult = await runtime.execute(
      buildMediaRequest({
        requestId: "cross_image",
        providerId: "provider.openai",
        capabilityId: "image.generate",
        modelId: "openai/dall-e-3",
      })
    );
    expect(imageResult.ok).toBe(true);
    if (imageResult.ok) expect(imageResult.value.success).toBe(true);

    await runtime.dispose();
  });

  it("registers 3 fake image providers and routes image.generate to correct leaf", async () => {
    const registry = new InMemoryProviderRuntimeRegistry();
    const fakeProviders = [
      { id: "provider.fake-a", tag: "fakeA" },
      { id: "provider.fake-b", tag: "fakeB" },
      { id: "provider.fake-c", tag: "fakeC" },
    ] as const;

    for (const p of fakeProviders) {
      registry.registerExecutable({
        providerId: asProviderId(p.id),
        dispatcher: new FakeImageDispatcher(p.id, p.tag),
        capabilities: ["image.generate"],
        status: "available",
      });
    }

    const dispatcher = new MultiProviderDispatcher({
      registry,
      modelCapabilityResolver: { supportsModelCapability: () => true },
    });
    const runtime = createProviderRuntime({ dispatcher, sleep: () => Promise.resolve() });

    for (const p of fakeProviders) {
      const result = await runtime.execute(
        buildMediaRequest({
          requestId: `fake_img_${p.tag}`,
          providerId: p.id,
          capabilityId: "image.generate",
          modelId: `${p.id}/model-1`,
        })
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.success).toBe(true);
      const url = (
        (result.value.response?.output as Record<string, unknown>)?.outputs as Array<
          Record<string, unknown>
        >
      )?.[0]?.url;
      expect(String(url)).toContain(p.tag);
    }

    await runtime.dispose();
  });

  it("normalizes image provider content-policy failures", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;

    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["image.generate"],
      status: "available",
    });

    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });

    const original = (openai.value as any).sdk?.http;
    if (original?.send) {
      jest.spyOn(original, "send").mockResolvedValueOnce({
        ok: false,
        error: new ProviderError("content policy violation", { status: 400 }),
      });
    }

    const result = await runtime.execute(
      buildMediaRequest({
        requestId: "img_policy",
        providerId: "provider.openai",
        capabilityId: "image.generate",
        modelId: "openai/dall-e-3",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });
});
