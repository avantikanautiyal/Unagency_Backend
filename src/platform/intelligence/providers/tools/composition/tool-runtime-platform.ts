/**
 * Enterprise tool runtime — production composition around ToolContinuationOrchestrator.
 */

import { failure, success, type Result } from "../../../shared/result";
import { AuthorizationError, ValidationError } from "../../../shared/errors";
import {
  asCapabilityId,
  asExecutionId,
  asOrganizationId,
  asProviderId,
  asWorkspaceId,
} from "../../../shared/identifiers";
import { createProviderRuntime } from "../../runtime/factories/create-provider-runtime";
import type { IProviderDispatcher } from "../../runtime/interfaces/provider-dispatcher";
import type { IProviderRuntime } from "../../runtime/interfaces/provider-runtime";
import { sampleRequest } from "../../runtime/testing";
import { InMemoryToolRegistry } from "../registry/in-memory-tool-registry";
import { ToolExecutor } from "../executor/tool-executor";
import {
  ToolContinuationOrchestrator,
  type ToolContinuationResult,
} from "../continuation/tool-continuation-orchestrator";
import { loadToolExecutionConfig } from "../config/tool-execution-config";
import type { IToolInvocationStore } from "../idempotency/tool-invocation-store";
import type {
  StructuredOutputRequest,
  ToolDefinition,
} from "../contracts/tool-contracts";
import type { AuthPrincipal } from "../../../../api/contracts";
import { registerFakeCertificationTools } from "../testing/fake-tools";

export interface ToolRuntimePlatform {
  readonly registry: InMemoryToolRegistry;
  readonly invocationStore: IToolInvocationStore;
  readonly orchestrator: ToolContinuationOrchestrator;
  readonly runtime: IProviderRuntime;
  readonly durable: boolean;
}

export function createToolRuntimePlatform(input: {
  readonly invocationStore: IToolInvocationStore;
  readonly dispatcher: IProviderDispatcher;
  readonly registry?: InMemoryToolRegistry;
  readonly durable: boolean;
  readonly seedCertificationTools?: boolean;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  /** When set, reuse this runtime instead of creating a parallel one (same dispatcher spine). */
  readonly runtime?: IProviderRuntime;
}): ToolRuntimePlatform {
  const registry = input.registry ?? new InMemoryToolRegistry();
  if (input.seedCertificationTools) {
    registerFakeCertificationTools(registry);
  }
  const config = loadToolExecutionConfig();
  const executor = new ToolExecutor({
    registry,
    invocationStore: input.invocationStore,
    nowIso: input.nowIso,
    clockMs: input.clockMs,
    defaultTimeoutMs: config.executionTimeoutMs,
  });
  const runtime =
    input.runtime ??
    createProviderRuntime({
      dispatcher: input.dispatcher,
      nowIso: input.nowIso,
      nowMs: input.clockMs,
      sleep: () => Promise.resolve(),
    });
  const orchestrator = new ToolContinuationOrchestrator({
    runtime,
    toolExecutor: executor,
    invocationStore: input.invocationStore,
    config,
    nowIso: input.nowIso,
  });
  return {
    registry,
    invocationStore: input.invocationStore,
    orchestrator,
    runtime,
    durable: input.durable,
  };
}

export function resolveServerTools(
  platform: ToolRuntimePlatform,
  toolNames: readonly string[]
): Result<readonly ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  for (const name of toolNames) {
    const registered = platform.registry.resolve(name);
    if (!registered) {
      return failure(new ValidationError(`Unknown tool '${name}'`));
    }
    tools.push(registered.definition);
  }
  return success(tools);
}

export function parseToolRequestMetadata(metadata: Readonly<Record<string, unknown>> | undefined): {
  readonly toolNames: readonly string[];
  readonly structuredOutput?: StructuredOutputRequest;
} {
  const toolNamesRaw = metadata?.toolNames;
  const toolNames = Array.isArray(toolNamesRaw)
    ? toolNamesRaw.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  const so = metadata?.structuredOutput;
  let structuredOutput: StructuredOutputRequest | undefined;
  if (so && typeof so === "object" && so !== null && "schema" in so) {
    const raw = so as {
      schema?: unknown;
      name?: unknown;
      strict?: unknown;
    };
    if (raw.schema && typeof raw.schema === "object") {
      structuredOutput = {
        schema: raw.schema as StructuredOutputRequest["schema"],
        name: typeof raw.name === "string" ? raw.name : undefined,
        strict: typeof raw.strict === "boolean" ? raw.strict : true,
      };
    }
  }
  return { toolNames, structuredOutput };
}

export async function executeToolAwareRequest(input: {
  readonly platform: ToolRuntimePlatform;
  readonly providerRequest: import("../../runtime/contracts/provider-execution-request").ProviderExecutionRequest;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly principalUserId?: string;
  readonly roles?: readonly string[];
  readonly toolNames: readonly string[];
  readonly structuredOutput?: StructuredOutputRequest;
  readonly allowSideEffectsWithoutApproval?: boolean;
  readonly workerId?: string;
}): Promise<Result<ToolContinuationResult>> {
  const resolved = resolveServerTools(input.platform, input.toolNames);
  if (!resolved.ok) return resolved;
  if (resolved.value.length === 0 && !input.structuredOutput) {
    return failure(new ValidationError("No server tools resolved"));
  }

  return input.platform.orchestrator.execute({
    providerRequest: input.providerRequest,
    tools: resolved.value,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    principalUserId: input.principalUserId,
    roles: input.roles,
    allowedToolNames: input.toolNames.length > 0 ? input.toolNames : undefined,
    structuredOutput: input.structuredOutput,
    allowSideEffectsWithoutApproval: input.allowSideEffectsWithoutApproval,
    workerId: input.workerId ?? "enterprise-tool-runtime",
  });
}

/** Build a provider request for unit tests / standalone tool runs. */
export function buildToolProviderRequest(input: {
  readonly executionId: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly prompt: string;
  readonly capabilityId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
}) {
  const providerId = input.providerId ?? "provider.openai";
  const base = sampleRequest({
    requestId: `${input.executionId}_tool`,
    providerId,
    payload: { prompt: input.prompt },
  });
  return {
    ...base,
    providerId: asProviderId(providerId),
    capabilityId: asCapabilityId(input.capabilityId ?? "text.generate"),
    modelId: input.modelId ?? "openai/gpt-4o",
    payload: { prompt: input.prompt },
    context: {
      ...base.context,
      providerId: asProviderId(providerId),
      organizationId: asOrganizationId(input.organizationId),
      workspaceId: asWorkspaceId(input.workspaceId ?? "ws_default"),
      executionId: asExecutionId(input.executionId),
    },
  };
}

export async function approveToolInvocation(input: {
  readonly platform: ToolRuntimePlatform;
  readonly organizationId: string;
  readonly executionId: string;
  readonly invocationKey: string;
  readonly principal: AuthPrincipal;
  readonly decision: "approve" | "reject";
  readonly reason?: string;
  readonly workerId?: string;
}): Promise<
  Result<{
    readonly record: import("../idempotency/tool-invocation-store").ToolInvocationRecord;
    readonly resumed?: ToolContinuationResult;
    readonly duplicate?: boolean;
  }>
> {
  if (
    input.principal.organizationId &&
    input.principal.organizationId !== input.organizationId
  ) {
    return failure(new AuthorizationError("tenant isolation violation"));
  }
  const existing = await input.platform.invocationStore.get(input.invocationKey);
  if (!existing || existing.executionId !== input.executionId) {
    return failure(new ValidationError("Tool invocation not found for execution"));
  }
  if (existing.organizationId !== input.organizationId) {
    return failure(new AuthorizationError("Cross-tenant approval denied"));
  }

  const decided = await input.platform.invocationStore.recordApproval({
    invocationKey: input.invocationKey,
    organizationId: input.organizationId,
    decision: {
      decision: input.decision,
      principalUserId: String(input.principal.userId ?? "unknown"),
      decidedAt: new Date().toISOString(),
      reason: input.reason,
    },
    expectedToolDefinitionVersion: existing.toolDefinitionVersion,
  });
  if (!decided.ok) {
    return failure(new ValidationError(`${decided.code}: ${decided.message}`));
  }

  if (input.decision === "reject") {
    const rejected = await input.platform.orchestrator.resumeAfterApproval({
      invocationKey: input.invocationKey,
      workerId: input.workerId ?? `reject_${input.principal.userId ?? "worker"}`,
      tools: [],
      organizationId: input.organizationId,
    });
    return success({
      record: decided.record,
      resumed: rejected.ok ? rejected.value : undefined,
      duplicate: decided.duplicate,
    });
  }

  if (decided.duplicate && decided.record.result) {
    return success({ record: decided.record, duplicate: true });
  }

  const toolNames =
    decided.record.checkpoint?.toolNames ?? [decided.record.toolName];
  const resolved = resolveServerTools(input.platform, toolNames);
  if (!resolved.ok) return resolved;

  const resumed = await input.platform.orchestrator.resumeAfterApproval({
    invocationKey: input.invocationKey,
    workerId: input.workerId ?? `resume_${input.principal.userId ?? "worker"}`,
    tools: resolved.value,
    organizationId: input.organizationId,
  });
  if (!resumed.ok) return resumed;
  const fresh = await input.platform.invocationStore.get(input.invocationKey);
  return success({
    record: fresh ?? decided.record,
    resumed: resumed.value,
    duplicate: decided.duplicate,
  });
}
