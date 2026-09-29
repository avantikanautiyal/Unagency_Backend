/**
 * Phase 15 — MODEL_GENERATION:
 * Action Registry → Orchestrator → CMR → Model Runtime → (optional) existing transport.
 * Does not compose prompts, resolve artifacts/refs/WM/multimodal, or call providers directly.
 */

import { isCdfCanonicalGenerationContextEnabled } from "../../../cdf/generation-context/flag";
import { orchestrateCanonicalGenerationContext } from "../../context-orchestrator";
import { prepareCanonicalModelRuntime } from "../../model-runtime";
import type { ActionDefinition } from "../../action-registry";
import type {
  ActionExecutionDeps,
  ActionExecutionResult,
  CanonicalActionExecutionRequest,
} from "../types";
import { executeStateTransitionAction } from "./state-transition";

export async function executeModelGenerationAction(
  action: ActionDefinition,
  request: CanonicalActionExecutionRequest,
  deps?: ActionExecutionDeps,
): Promise<ActionExecutionResult> {
  const dryRun = request.dryRun === true;

  // Capability catalog entries: describe only — never invoke AI.
  if (action.metadata.neverExecutesAi === true) {
    return {
      ok: true,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      sideEffectLevel: action.sideEffectLevel,
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      result: {
        kind: "capability_definition",
        value: {
          capabilityId: action.metadata.capabilityId,
          neverExecutesAi: true,
        },
      },
      metadata: {
        delegatedTo: "capability_metadata",
        neverExecutesAi: true,
        providerNeutral: true,
      },
    };
  }

  // CDF refine transition is MODEL_GENERATION in registry but mutates via state machine.
  if (action.actionId.startsWith("cdf.transition.")) {
    return executeStateTransitionAction(action, request);
  }

  if (dryRun) {
    // Mutating generation: no fake success without safe executor dry-run.
    if (
      action.sideEffectLevel === "MUTATING" ||
      action.sideEffectLevel === "EXTERNAL_SIDE_EFFECT"
    ) {
      return {
        ok: false,
        actionId: action.actionId,
        actionVersion: action.version,
        executionMode: action.executionMode,
        code: "DRY_RUN_UNSUPPORTED",
        message:
          "Mutating MODEL_GENERATION has no safe dry-run in existing executors",
        dryRun: true,
        requestId: request.requestId,
        correlationId: request.correlationId,
        executionId: request.executionId,
      };
    }
  }

  const serviceId = request.executionContext.cdfServiceId;
  const phaseId = request.executionContext.cdfPhaseId;
  let contractCanonical = false;
  if (serviceId && phaseId) {
    const { resolveCdfPhaseExecutionContract } = await import(
      "../../../cdf/canonical"
    );
    const contract = resolveCdfPhaseExecutionContract({ serviceId, phaseId });
    contractCanonical = contract?.executionStrategy === "canonical";
  }

  // Contract-canonical phases do not require the strangler generation flag.
  if (!isCdfCanonicalGenerationContextEnabled() && !contractCanonical) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_NOT_SUPPORTED",
      message:
        "Canonical MODEL_GENERATION requires CDF_CANONICAL_GENERATION_CONTEXT (default OFF)",
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      details: { reason: "flag_off" },
    };
  }

  const { resolveCanonicalGenerationEligibility } = await import(
    "../../production-hardening/eligibility"
  );
  const { emitCanonicalRolloutDecisionTrace } = await import(
    "../../production-hardening/rollout-observability"
  );
  const eligibility = resolveCanonicalGenerationEligibility({
    organizationId:
      request.authorizationContext.organizationId ??
      request.executionContext.organizationId,
    projectId:
      request.authorizationContext.projectId ??
      request.executionContext.projectId,
    serviceId,
    cdfSessionId: request.executionContext.cdfSessionId,
    cdfPhaseId: phaseId,
    executionId: request.executionId,
    metadata: {
      cdfServiceId: serviceId,
      cdfSessionId: request.executionContext.cdfSessionId,
      cdfPhaseId: phaseId,
      ...(contractCanonical ? { cdfExecutionStrategy: "canonical" } : {}),
    },
  });
  emitCanonicalRolloutDecisionTrace(eligibility, request.executionId);
  // Class-A / stage allowlists never block contract-canonical phases.
  if (!eligibility.eligible && !contractCanonical) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_NOT_SUPPORTED",
      message: `Canonical MODEL_GENERATION not eligible: ${eligibility.reason}`,
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
      details: {
        reason: eligibility.denyReason ?? "rollout_not_eligible",
        path: eligibility.path,
        stage: eligibility.stage,
      },
    };
  }

  const org =
    request.authorizationContext.organizationId ??
    request.executionContext.organizationId;
  if (!org) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "UNAUTHORIZED",
      message: "organizationId required for generation",
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId: request.executionId,
    };
  }

  const executionId =
    request.executionId ??
    request.requestId ??
    `exec_action_${Date.now()}`;
  const instruction =
    request.executionContext.currentInstruction ??
    request.input.orchestration?.conversationalInstruction ??
    "";
  const metadata: Record<string, unknown> = {
    ...(request.input.orchestration?.metadata ?? {}),
    ...(request.metadata ?? {}),
    cdfSessionId: request.executionContext.cdfSessionId,
    cdfPhaseId: request.executionContext.cdfPhaseId,
    cdfServiceId: request.executionContext.cdfServiceId,
    apiExecutionId: executionId,
    executionId,
    correlationId: request.correlationId ?? executionId,
    actionId: action.actionId,
    actionVersion: action.version,
  };
  // Exact upstream pin identity for Orchestrator (Phase 8 resolves bodies — not here).
  if (request.executionContext.upstreamArtifactRef) {
    metadata.upstreamArtifactRef = request.executionContext.upstreamArtifactRef;
  }

  const orchestration = orchestrateCanonicalGenerationContext({
    prompt: request.input.orchestration?.prompt ?? instruction,
    conversationalInstruction: instruction,
    metadata,
    organizationId: org,
    projectId:
      request.authorizationContext.projectId ??
      request.executionContext.projectId,
    conversationMessages: request.input.orchestration
      ?.conversationMessages as never,
  });

  if (!orchestration.ok) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_FAILED",
      message: orchestration.message,
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId,
      details: { orchestratorCode: orchestration.code },
    };
  }

  if (orchestration.skipped) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_NOT_SUPPORTED",
      message: "Context Orchestrator skipped — canonical path not applied",
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId,
      details: { reason: "orchestrator_skipped" },
    };
  }

  const modelRuntime = prepareCanonicalModelRuntime({
    modelRequest: orchestration.modelRequest,
  });

  if (!modelRuntime.ok) {
    return {
      ok: false,
      actionId: action.actionId,
      actionVersion: action.version,
      executionMode: action.executionMode,
      code: "EXECUTION_FAILED",
      message: modelRuntime.message,
      dryRun,
      requestId: request.requestId,
      correlationId: request.correlationId,
      executionId,
      details: { modelRuntimeCode: modelRuntime.code },
    };
  }

  let transport:
    | { ok: boolean; providerInvoked: boolean; error?: string }
    | undefined;
  if (deps?.runGenerationTransport) {
    transport = await deps.runGenerationTransport({
      modelRequest: orchestration.modelRequest,
      prompt: orchestration.prompt,
      metadata: orchestration.metadata,
      organizationId: org,
      projectId:
        request.authorizationContext.projectId ??
        request.executionContext.projectId,
      executionId,
    });
    if (!transport.ok) {
      return {
        ok: false,
        actionId: action.actionId,
        actionVersion: action.version,
        executionMode: action.executionMode,
        code: "EXECUTION_FAILED",
        message: transport.error ?? "generation transport failed",
        dryRun,
        requestId: request.requestId,
        correlationId: request.correlationId,
        executionId,
      };
    }
  }

  return {
    ok: true,
    actionId: action.actionId,
    actionVersion: action.version,
    executionMode: action.executionMode,
    sideEffectLevel: action.sideEffectLevel,
    dryRun,
    requestId: request.requestId,
    correlationId: request.correlationId ?? executionId,
    executionId,
    result: {
      kind: "generation_result",
      value: {
        contextId: orchestration.metadata.cdfCanonicalContextId,
        contextHash: orchestration.metadata.cdfCanonicalContextHash,
        modelRuntimeApplied: true,
        providerInvoked: transport?.providerInvoked ?? false,
        artifactContinuityComplete:
          action.metadata.artifactContinuityComplete === true,
        serviceDependencyClass: action.metadata.serviceDependencyClass,
      },
      modelRequest: orchestration.modelRequest,
      modelRuntime,
      orchestration,
    },
    metadata: {
      delegatedTo: "orchestrateCanonicalGenerationContext+prepareCanonicalModelRuntime",
      contextAssembly: "context_orchestrator",
      providerCalledDirectly: false,
      promptComposedInActionExecution: false,
      artifactLookupInActionExecution: false,
      referenceResolutionInActionExecution: false,
      conversationRetrievalInActionExecution: false,
      providerInvoked: transport?.providerInvoked ?? false,
      artifactContinuityComplete:
        action.metadata.artifactContinuityComplete === true,
      serviceDependencyClass: action.metadata.serviceDependencyClass,
      classDLimitation: action.metadata.classDLimitation,
    },
  };
}
