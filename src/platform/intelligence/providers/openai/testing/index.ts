/**
 * OpenAI provider testing helpers.
 */

import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import { NO_RETRY_POLICY } from "../../runtime/contracts/retry-policy";
import type { ProviderExecutionRequest } from "../../runtime/contracts/provider-execution-request";
import {
  createOpenAIProvider,
  type CreateOpenAIProviderOptions,
  type OpenAIProviderPlatform,
} from "../factories/create-openai-provider";
import type { DesiredCapabilityProfile } from "../contracts/openai-contracts";

export function deterministicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    clockMs: () => (ms += 5),
  };
}

export function sampleCapabilityProfile(
  overrides: Partial<DesiredCapabilityProfile> = {}
): DesiredCapabilityProfile {
  return {
    capabilityId: "text.generate",
    modality: "text",
    requireStreaming: false,
    requireToolCalling: true,
    requireStructuredOutputs: true,
    maxCostPreference: "balanced",
    ...overrides,
  };
}

export function sampleExecutionRequest(
  overrides: Partial<ProviderExecutionRequest> = {}
): ProviderExecutionRequest {
  return {
    requestId: "openai_exec_1",
    context: {
      executionId: asExecutionId("exec_openai_1"),
      organizationId: asOrganizationId("org_1"),
      workspaceId: asWorkspaceId("ws_1"),
      providerId: asProviderId("openai"),
    },
    capabilityId: asCapabilityId("text.generate"),
    providerId: asProviderId("openai"),
    // Intentionally omit modelId — resolver must pick best OpenAI model
    payload: {
      messages: [{ role: "user", content: "Launch our new sneaker collection" }],
    },
    options: { temperature: 0.7 },
    retryPolicy: NO_RETRY_POLICY,
    timeoutPolicy: { executionTimeoutMs: 30_000 },
    streaming: false,
    priority: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export async function setupOpenAIProvider(
  options: CreateOpenAIProviderOptions = {}
): Promise<OpenAIProviderPlatform> {
  const helpers = deterministicHelpers();
  const result = await createOpenAIProvider({
    mode: "simulated",
    ...helpers,
    ...options,
  });
  if (!result.ok) throw result.error;
  return result.value;
}
