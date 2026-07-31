/**
 * M9.5I — audio/speech provider activation (offline certification).
 * Zero external network calls.
 */

import { createProviderRuntime } from "../../../../../src/platform/intelligence/providers/runtime/factories/create-provider-runtime";
import type { ProviderExecutionRequest } from "../../../../../src/platform/intelligence/providers/runtime/contracts/provider-execution-request";
import type { CancellationToken } from "../../../../../src/platform/intelligence/providers/runtime/contracts/cancellation";
import { sampleRequest } from "../../../../../src/platform/intelligence/providers/runtime/testing";
import { success, type Result } from "../../../../../src/platform/intelligence/shared/result";
import {
  asCapabilityId,
  asProviderId,
  asExecutionId,
  asOrganizationId,
  asWorkspaceId,
} from "../../../../../src/platform/intelligence/shared/identifiers";
import type { IProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/interfaces/provider-dispatcher";
import { InMemoryProviderRuntimeRegistry } from "../../../../../src/platform/intelligence/providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../../../../src/platform/intelligence/providers/runtime/dispatcher/multi-provider-dispatcher";
import { createModelRegistryPlatform } from "../../../../../src/platform/intelligence/model-registry/factories/create-model-registry-platform";
import { createOpenAIProvider } from "../../../../../src/platform/intelligence/providers/openai/factories/create-openai-provider";
import { OPENAI_PROVIDER_ID } from "../../../../../src/platform/intelligence/providers/openai/constants";
import { registerAudioProviders } from "../../../../../src/platform/production/execution/register-audio-providers";
import { ElevenLabsAudioProtocol } from "../../../../../src/platform/intelligence/providers/audio/elevenlabs/elevenlabs-audio-protocol";
import { CartesiaAudioProtocol } from "../../../../../src/platform/intelligence/providers/audio/cartesia/cartesia-audio-protocol";
import { ELEVENLABS_AUDIO_SPEC, CARTESIA_AUDIO_SPEC } from "../../../../../src/platform/intelligence/providers/audio/configs/verified-audio-provider-specs";
import type { IAudioHttpClient } from "../../../../../src/platform/intelligence/providers/audio/http/audio-http-client";
import { ProviderError } from "../../../../../src/platform/intelligence/shared/errors";
import { FailoverOrchestrator } from "../../../../../src/platform/intelligence/providers/routing/performance/failover/failover-orchestrator";
import { loadProviderFailoverConfig } from "../../../../../src/platform/intelligence/providers/routing/performance/config/adaptive-routing-config";

function buildAudioRequest(overrides: {
  requestId?: string;
  providerId: string;
  capabilityId: string;
  modelId: string;
  payload?: Record<string, unknown>;
  organizationId?: string;
}): ProviderExecutionRequest {
  const org = overrides.organizationId ?? "org_test";
  const base = sampleRequest({
    requestId: overrides.requestId ?? "req_audio",
    providerId: overrides.providerId,
  });
  return {
    ...base,
    requestId: overrides.requestId ?? base.requestId,
    providerId: asProviderId(overrides.providerId),
    capabilityId: asCapabilityId(overrides.capabilityId),
    modelId: overrides.modelId,
    payload: overrides.payload ?? { text: "Hello from UNAGENCY TTS certification." },
    context: {
      ...base.context,
      providerId: asProviderId(overrides.providerId),
      organizationId: asOrganizationId(org),
      workspaceId: asWorkspaceId(base.context.workspaceId),
      executionId: asExecutionId(base.context.executionId),
    },
  };
}

class TrackingAudioHttpClient implements IAudioHttpClient {
  readonly calls: unknown[] = [];
  constructor(
    private readonly vendor: string,
    private readonly fail?: boolean
  ) {}

  async send(request: import("../../../../../src/platform/intelligence/providers/audio/http/audio-http-client").AudioHttpRequest) {
    this.calls.push(request);
    if (this.fail) {
      return {
        ok: false as const,
        error: new ProviderError(`${this.vendor} rate limited`, { status: 429 }),
      };
    }
    const text = String(request.body?.text ?? request.body?.transcript ?? "sim");
    return success({
      status: 200,
      headers: { "content-type": "audio/mpeg" },
      body: {
        _contentType: "audio/mpeg",
        _audioUrl: `https://example.local/${this.vendor}/out.mp3`,
        _inputCharacters: text.length,
      },
      latencyMs: 12,
    });
  }
}

describe("M9.5I audio provider activation", () => {
  it("OpenAI audio.synthesize routes to /audio/speech and normalizes audio outputs", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["audio.synthesize", "audio.transcribe", "text.generate"],
      status: "available",
      dispatcherSupportsStreamingProviderId: asProviderId(OPENAI_PROVIDER_ID),
    });
    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
        registry,
        modelCapabilityResolver: { supportsModelCapability: () => true },
      }),
      sleep: () => Promise.resolve(),
    });

    const result = await runtime.execute(
      buildAudioRequest({
        providerId: "provider.openai",
        capabilityId: "audio.synthesize",
        modelId: "openai/tts-1",
        payload: { text: "Certify TTS", voice: "alloy" },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    const outputs = (result.value.response?.output as Record<string, unknown>)?.outputs;
    expect(Array.isArray(outputs)).toBe(true);
    expect((outputs as Array<Record<string, unknown>>)[0]?.type).toBe("audio");
    await runtime.dispose();
  });

  it("OpenAI audio.transcribe returns normalized transcript", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["audio.transcribe"],
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
      buildAudioRequest({
        providerId: "provider.openai",
        capabilityId: "audio.transcribe",
        modelId: "openai/whisper-1",
        payload: {
          audio: {
            storageRef: "org/org_test/audio/input.mp3",
            organizationId: "org_test",
            mimeType: "audio/mpeg",
          },
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    const transcript = (result.value.response?.output as Record<string, unknown>)?.transcript;
    expect(transcript).toBeDefined();
    await runtime.dispose();
  });

  it("rejects cross-tenant STT input before provider dispatch", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["audio.transcribe"],
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
      buildAudioRequest({
        providerId: "provider.openai",
        capabilityId: "audio.transcribe",
        modelId: "openai/whisper-1",
        organizationId: "org_a",
        payload: {
          audio: {
            storageRef: "org/org_b/audio/secret.mp3",
            organizationId: "org_b",
            mimeType: "audio/mpeg",
          },
        },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("rejects OpenAI TTS with whisper model", async () => {
    const openai = await createOpenAIProvider({ mode: "simulated", skipCertification: true });
    if (!openai.ok) throw openai.error;
    const registry = new InMemoryProviderRuntimeRegistry();
    registry.registerExecutable({
      providerId: asProviderId("provider.openai"),
      dispatcher: openai.value.dispatcher,
      capabilities: ["audio.synthesize"],
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
      buildAudioRequest({
        providerId: "provider.openai",
        capabilityId: "audio.synthesize",
        modelId: "openai/whisper-1",
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.success).toBe(false);
    await runtime.dispose();
  });

  it("ElevenLabs protocol maps canonical request to verified wire contract", () => {
    const protocol = new ElevenLabsAudioProtocol();
    const plan = protocol.buildTtsRequest({
      spec: ELEVENLABS_AUDIO_SPEC,
      request: buildAudioRequest({
        providerId: "provider.elevenlabs",
        capabilityId: "audio.synthesize",
        modelId: "elevenlabs/eleven-turbo-v2-5",
        payload: { text: "Wire test", voice: "custom_voice" },
      }),
      wireModelId: "eleven_turbo_v2_5",
      voiceId: ELEVENLABS_AUDIO_SPEC.defaultVoiceId,
    });
    expect(plan.request.path).toBe("/v1/text-to-speech/custom_voice");
    expect(plan.request.body?.model_id).toBe("eleven_turbo_v2_5");
    expect(plan.request.body?.text).toBe("Wire test");
  });

  it("Cartesia protocol maps canonical request to verified wire contract", () => {
    const protocol = new CartesiaAudioProtocol();
    const plan = protocol.buildTtsRequest({
      spec: CARTESIA_AUDIO_SPEC,
      request: buildAudioRequest({
        providerId: "provider.cartesia",
        capabilityId: "audio.speech_generation",
        modelId: "cartesia/sonic-2",
      }),
      wireModelId: "sonic-2",
      voiceId: CARTESIA_AUDIO_SPEC.defaultVoiceId,
    });
    expect(plan.request.path).toBe("/tts/bytes");
    expect(plan.request.headers?.["Cartesia-Version"]).toBe("2024-06-10");
    expect(plan.request.body?.model_id).toBe("sonic-2");
  });

  it("registers verified TTS providers and executes offline", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const elevenHttp = new TrackingAudioHttpClient("elevenlabs");
    const cartesiaHttp = new TrackingAudioHttpClient("cartesia");
    const registered = registerAudioProviders({
      executionMode: "openai_simulated",
      modelRegistry: modelRegistry.registry,
      registry,
      httpClientsByVendor: {
        elevenlabs: elevenHttp,
        cartesia: cartesiaHttp,
      },
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value.length).toBeGreaterThanOrEqual(2);

    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
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
      }),
      sleep: () => Promise.resolve(),
    });

    const result = await runtime.execute(
      buildAudioRequest({
        providerId: "provider.elevenlabs",
        capabilityId: "audio.synthesize",
        modelId: "elevenlabs/eleven-turbo-v2-5",
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.success).toBe(true);
    expect(elevenHttp.calls.length).toBe(1);
    await runtime.dispose();
  });

  it("TTS failover: primary rate limit → secondary success", async () => {
    const modelRegistry = createModelRegistryPlatform({ loadSeed: true });
    const registry = new InMemoryProviderRuntimeRegistry();
    const failHttp = new TrackingAudioHttpClient("elevenlabs", true);
    const okHttp = new TrackingAudioHttpClient("cartesia");
    registerAudioProviders({
      executionMode: "openai_simulated",
      modelRegistry: modelRegistry.registry,
      registry,
      httpClientsByVendor: { elevenlabs: failHttp, cartesia: okHttp },
    });

    const runtime = createProviderRuntime({
      dispatcher: new MultiProviderDispatcher({
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
      }),
      sleep: () => Promise.resolve(),
    });

    const failover = new FailoverOrchestrator({
      runtime,
      failover: loadProviderFailoverConfig({ PROVIDER_FAILOVER_ENABLED: "true" }),
      nowIso: () => new Date().toISOString(),
      createId: (p) => `${p}_fo`,
    });

    const base = buildAudioRequest({
      providerId: "provider.elevenlabs",
      capabilityId: "audio.synthesize",
      modelId: "elevenlabs/eleven-turbo-v2-5",
    });

    const out = await failover.executeCandidates(base, [
      {
        providerId: "provider.elevenlabs",
        modelId: "elevenlabs/eleven-turbo-v2-5",
        primaryOrFailover: "primary",
        positionInRoute: 0,
      },
      {
        providerId: "provider.cartesia",
        modelId: "cartesia/sonic-2",
        primaryOrFailover: "failover",
        positionInRoute: 1,
      },
    ]);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(String(out.value.finalProviderId)).toBe("provider.cartesia");
    expect(out.value.result.success).toBe(true);
    expect(failHttp.calls.length).toBe(1);
    expect(okHttp.calls.length).toBe(1);
    await runtime.dispose();
  });
});
