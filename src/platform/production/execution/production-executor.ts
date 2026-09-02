/**
 * Production Execution — wires Direct Execution Engine + real provider leaves.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import { createDirectExecutionPlatform } from "../../direct/create-direct-execution-platform";
import type { IDirectExecutionEngine } from "../../direct/contracts";
import type {
  DirectExecutionReport,
  DirectExecutionRequest,
} from "../../direct/contracts";
import {
  createOpenAIProvider,
  type OpenAIProviderPlatform,
} from "../../providers/openai/factories/create-openai-provider";
import { createIdentityPlatform } from "../../providers/identity/factories/create-identity-platform";
import { RegisterCredentialInputBuilder } from "../../providers/identity/builders/register-credential-input-builder";
import {
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
  asCapabilityId,
} from "../../core/identifiers";
import { createModelRegistryPlatform } from "../../model-registry/factories/create-model-registry-platform";
import { InMemoryProviderRuntimeRegistry } from "../../providers/runtime/registry/in-memory-provider-runtime-registry";
import { MultiProviderDispatcher } from "../../providers/runtime/dispatcher";
import type { IProviderDispatcher } from "../../providers/runtime/interfaces/provider-dispatcher";
import { createToolRuntimePlatform } from "../../providers/tools/composition/tool-runtime-platform";
import { InMemoryToolInvocationStore } from "../../providers/tools/idempotency/in-memory-tool-invocation-store";
import { registerTextProviders } from "./register-text-providers";
import { registerAudioProviders } from "./register-audio-providers";
import { registerImageProviders } from "./register-image-providers";
import { registerVideoProviders } from "./register-video-providers";
import { evaluateTextProviderEnv } from "./text-provider-env";
import type { ProductionExecutionMode } from "../contracts/enums";
import type { ProductionScenario } from "../contracts/scenario";
import type { ToolRuntimePlatform } from "../../providers/tools/composition/tool-runtime-platform";

export interface ProductionExecutionContext {
  readonly openai: OpenAIProviderPlatform;
  readonly integration: IDirectExecutionEngine;
  readonly executionMode: ProductionExecutionMode;
  readonly providerMode: "live" | "simulated";
  readonly identitySessionId?: string;
  readonly configuredProviders: readonly string[];
  readonly toolRuntime: ToolRuntimePlatform;
  readonly runtimeDispatcher: IProviderDispatcher;
  readonly providerRuntimeRegistry: InMemoryProviderRuntimeRegistry;
}

export interface ProductionExecutionDeps {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  readonly mode?: ProductionExecutionMode;
  readonly apiKey?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly openai?: OpenAIProviderPlatform;
  readonly organizationIdForFixtures?: string;
  readonly workspaceIdForFixtures?: string;
}

function resolveMode(deps: ProductionExecutionDeps): ProductionExecutionMode {
  if (deps.mode) return deps.mode;
  const key = deps.apiKey ?? process.env.OPENAI_API_KEY;
  return key?.trim() ? "live" : "openai_simulated";
}

export async function bootProductionExecution(
  deps: ProductionExecutionDeps = {}
): Promise<Result<ProductionExecutionContext>> {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const clockMs = deps.clockMs ?? (() => Date.now());
  const createId = deps.createId ?? ((p) => `${p}_${clockMs()}`);
  const executionMode = resolveMode(deps);
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  const orgId = asOrganizationId(deps.organizationId ?? "org_production");
  const wsId = asWorkspaceId(deps.workspaceId ?? "ws_production");

  let identitySessionId: string | undefined;

  if (executionMode === "live") {
    const enabledProviders = evaluateTextProviderEnv(process.env).filter((p) => p.enabled);
    if (enabledProviders.length === 0) {
      return failure(
        new ValidationError(
          "At least one text provider must be enabled and configured for live production execution"
        )
      );
    }
    if (apiKey?.trim()) {
      const identity = createIdentityPlatform({});
      const input = new RegisterCredentialInputBuilder()
        .withProvider(asProviderId("openai"))
        .withScheme("api_key")
        .withSecret(apiKey)
        .withTenancy("organization")
        .withOrganization(orgId)
        .withWorkspace(wsId)
        .withTrustLevel("high")
        .withPermissions(["read", "execute"])
        .build();

      const registered = await identity.store.registerCredential(input);
      if (!registered.ok) return registered;

      const session = await identity.engine.createCredentialSession({
        providerId: asProviderId("openai"),
        organizationId: orgId,
        workspaceId: wsId,
        capabilityId: asCapabilityId("cap-text-generation"),
        requiredPermissions: ["read", "execute"],
      });
      if (!session.ok) return session;
      identitySessionId = session.value.sessionId;
    }
  }

  const modelRegistry = createModelRegistryPlatform({ nowIso, loadSeed: true });
  const executableProviders = new InMemoryProviderRuntimeRegistry();

  const textProviders = await registerTextProviders({
    env: process.env,
    executionMode,
    modelRegistry: modelRegistry.registry,
    registry: executableProviders,
    nowIso,
    clockMs,
  });
  if (!textProviders.ok) return textProviders;

  const audioProviders = registerAudioProviders({
    env: process.env,
    executionMode,
    modelRegistry: modelRegistry.registry,
    registry: executableProviders,
    nowIso,
    clockMs,
  });
  if (!audioProviders.ok) return audioProviders;

  const imageProviders = registerImageProviders({
    env: process.env,
    executionMode,
    modelRegistry: modelRegistry.registry,
    registry: executableProviders,
    nowIso,
    clockMs,
  });
  if (!imageProviders.ok) return imageProviders;

  const videoProviders = registerVideoProviders({
    env: process.env,
    executionMode,
    modelRegistry: modelRegistry.registry,
    registry: executableProviders,
    nowIso,
    clockMs,
  });
  if (!videoProviders.ok) return videoProviders;

  const openaiEntry = textProviders.value.find(
    (p) => String(p.providerId) === "provider.openai"
  );

  let platform: OpenAIProviderPlatform;
  if (deps.openai) {
    platform = deps.openai;
  } else if (openaiEntry) {
    const created = await createOpenAIProvider({
      mode: executionMode === "live" ? "live" : "simulated",
      auth:
        executionMode === "live"
          ? { apiKey: apiKey!, organizationId: deps.organizationId }
          : undefined,
      nowIso,
      clockMs,
      createId,
      skipCertification: true,
    });
    if (!created.ok) return created;
    platform = created.value;
  } else {
    const created = await createOpenAIProvider({
      mode: "simulated",
      skipCertification: true,
      nowIso,
      clockMs,
      createId,
    });
    if (!created.ok) return created;
    platform = created.value;
  }

  const modelCapabilityResolver = {
    supportsModelCapability: (modelId: string, capabilityId: string) => {
      const model = modelRegistry.registry.getModel(modelId);
      if (!model.ok) return false;
      return model.value.capabilities.some(
        (c) => c.capabilityId === capabilityId && c.supported
      );
    },
  };

  const runtimeDispatcher = new MultiProviderDispatcher({
    registry: executableProviders,
    modelCapabilityResolver,
  });

  const toolRuntime = createToolRuntimePlatform({
    invocationStore: new InMemoryToolInvocationStore(),
    dispatcher: runtimeDispatcher,
    durable: false,
    seedCertificationTools: false,
    nowIso,
    clockMs,
  });

  const { engine } = createDirectExecutionPlatform({
    nowIso,
    clockMs,
    createId,
    runtimeDispatcher,
    toolRuntime,
  });

  return success({
    openai: platform,
    integration: engine,
    executionMode,
    providerMode: platform.mode,
    identitySessionId,
    configuredProviders: executableProviders.listAvailableProviderIds().map(String),
    toolRuntime,
    runtimeDispatcher,
    providerRuntimeRegistry: executableProviders,
  });
}

export async function executeScenario(
  ctx: ProductionExecutionContext,
  scenario: ProductionScenario,
  requestId: string,
  correlationId: string,
  opts: {
    organizationId?: string;
    workspaceId?: string;
    budgetLimit?: number;
    tokenBudgetLimit?: number;
  } = {}
): Promise<Result<DirectExecutionReport>> {
  const req: DirectExecutionRequest = {
    requestId,
    rawPrompt: scenario.businessPrompt,
    scenarioHint: scenario.domain,
    organizationId: opts.organizationId
      ? asOrganizationId(opts.organizationId)
      : undefined,
    workspaceId: opts.workspaceId ? asWorkspaceId(opts.workspaceId) : undefined,
    budgetLimit: opts.budgetLimit ?? 500,
    tokenBudgetLimit: opts.tokenBudgetLimit ?? 200_000,
    correlationId,
    mode: "full",
    metadata: {
      productionScenarioId: scenario.scenarioId,
      productionDomain: scenario.domain,
      identitySessionId: ctx.identitySessionId,
      executionMode: ctx.executionMode,
    },
  };
  return ctx.integration.run(req);
}
