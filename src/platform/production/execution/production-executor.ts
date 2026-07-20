/**
 * Production Execution — wires Integration Layer + real OpenAI provider leaf.
 * Never uses ControllableDispatcher; never modifies Runtime.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import { createIntelligenceOsIntegrationPlatform } from "../../intelligence/integration/factories/create-intelligence-os-integration-platform";
import type { IIntelligenceOsIntegrationEngine } from "../../intelligence/integration/interfaces/integration";
import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { IntelligenceOsIntegrationRequest } from "../../intelligence/integration/contracts/request";
import {
  createOpenAIProvider,
  type OpenAIProviderPlatform,
} from "../../intelligence/providers/openai/factories/create-openai-provider";
import { createIdentityPlatform } from "../../intelligence/providers/identity/factories/create-identity-platform";
import { RegisterCredentialInputBuilder } from "../../intelligence/providers/identity/builders/register-credential-input-builder";
import {
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
  asCapabilityId,
} from "../../intelligence/shared/identifiers";
import { ProductionPinnedOpenAIDispatcher } from "./pinned-openai-dispatcher";
import type { ProductionExecutionMode } from "../contracts/enums";
import type { ProductionScenario } from "../contracts/scenario";

export interface ProductionExecutionContext {
  readonly openai: OpenAIProviderPlatform;
  readonly integration: IIntelligenceOsIntegrationEngine;
  readonly executionMode: ProductionExecutionMode;
  readonly providerMode: "live" | "simulated";
  readonly identitySessionId?: string;
}

export interface ProductionExecutionDeps {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
  /** Force mode; defaults to live when OPENAI_API_KEY present. */
  readonly mode?: ProductionExecutionMode;
  readonly apiKey?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  /** Injected openai platform (tests). */
  readonly openai?: OpenAIProviderPlatform;
}

function resolveMode(deps: ProductionExecutionDeps): ProductionExecutionMode {
  if (deps.mode) return deps.mode;
  const key = deps.apiKey ?? process.env.OPENAI_API_KEY;
  return key?.trim() ? "live" : "openai_simulated";
}

/**
 * Boot OpenAI leaf + Integration OS with OpenAI dispatcher (no bypass).
 * Credentials registered via Provider Identity Platform when live.
 */
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
    if (!apiKey?.trim()) {
      return failure(
        new ValidationError("OPENAI_API_KEY required for live production execution")
      );
    }
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

  let platform: OpenAIProviderPlatform;
  if (deps.openai) {
    platform = deps.openai;
  } else {
    const created = await createOpenAIProvider({
      mode: executionMode === "live" ? "live" : "simulated",
      auth:
        executionMode === "live"
          ? { apiKey: apiKey!, organizationId: deps.organizationId }
          : undefined,
      nowIso,
      clockMs,
      createId,
    });
    if (!created.ok) return created;
    platform = created.value;
  }

  const { engine } = createIntelligenceOsIntegrationPlatform({
    nowIso,
    clockMs,
    createId,
    runtimeDispatcher: new ProductionPinnedOpenAIDispatcher(platform),
  });

  return success({
    openai: platform,
    integration: engine,
    executionMode,
    providerMode: platform.mode,
    identitySessionId,
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
): Promise<Result<IntelligenceOsIntegrationReport>> {
  const req: IntelligenceOsIntegrationRequest = {
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
