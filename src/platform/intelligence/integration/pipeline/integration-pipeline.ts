/**
 * Integration pipeline — sequences bridges only. No module-to-module calls.
 * This is a wiring coordinator, not a business orchestration engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { IntelligenceOsIntegrationRequest } from "../contracts/request";
import type { IntelligenceOsIntegrationReport } from "../contracts/result";
import type { IntegrationArtifactBag } from "../contracts/artifacts";
import type { BridgeObservabilityRecord, StageTraceRecord } from "../contracts/trace";
import type { IntegrationStageKind } from "../contracts/enums";
import {
  asIntegrationResultId,
  asIntegrationTraceId,
} from "../contracts/identifiers";
import type { IIntegrationPipeline } from "../interfaces/integration";
import type { IntegrationBridgeSet } from "../interfaces/integration";
import type { RawRequestTaskBridge } from "../bridges/stage-bridges";
import { INTELLIGENCE_OS_INTEGRATION_VERSION } from "../constants";

export interface IntegrationPipelineDeps {
  readonly bridges: IntegrationBridgeSet & { readonly rawTask: RawRequestTaskBridge };
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export class IntegrationPipeline implements IIntegrationPipeline {
  private readonly nowIso: () => string;
  private readonly clockMs: () => number;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: IntegrationPipelineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.clockMs = deps.clockMs ?? (() => Date.now());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async execute(
    request: IntelligenceOsIntegrationRequest
  ): Promise<Result<IntelligenceOsIntegrationReport>> {
    const start = this.clockMs();
    if (!request.requestId?.trim()) {
      return failure(new ValidationError("requestId is required"));
    }
    if (!request.rawPrompt?.trim()) {
      return failure(new ValidationError("rawPrompt is required"));
    }

    const correlationId = request.correlationId ?? request.requestId;
    const ctx = { correlationId, requestId: request.requestId, request };
    const bag: IntegrationArtifactBag = {};
    const stages: StageTraceRecord[] = [];
    const bridges: BridgeObservabilityRecord[] = [];
    const completed: IntegrationStageKind[] = [];
    const mode = request.mode ?? "full";

    const stopAfterRouting = mode === "planning_through_routing";

    const push = (
      stage: IntegrationStageKind,
      status: StageTraceRecord["status"],
      message: string,
      durationMs: number,
      artifactRefs: readonly string[] = []
    ) => {
      const completedAt = this.nowIso();
      stages.push({
        stage,
        status,
        startedAt: completedAt,
        completedAt,
        durationMs,
        message,
        artifactRefs,
      });
      if (status === "succeeded") completed.push(stage);
    };

    // 1. Task
    {
      const r = await this.deps.bridges.rawTask.transfer(ctx);
      if (!r.ok) {
        push("task_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "task_intelligence");
      }
      bridges.push(r.value.observability);
      bag.task = r.value.value;
      push("task_intelligence", "succeeded", "Task plan produced", r.value.observability.durationMs, [
        String(bag.task.resultId),
      ]);
    }

    // 2. Capability
    {
      const r = await this.deps.bridges.taskCapability.transfer(ctx, bag.task!);
      if (!r.ok) {
        push("capability_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "capability_intelligence");
      }
      bridges.push(r.value.observability);
      bag.capability = r.value.value;
      push(
        "capability_intelligence",
        "succeeded",
        "Capability execution plan produced",
        r.value.observability.durationMs
      );
    }

    // 3. Agent
    {
      const r = await this.deps.bridges.capabilityAgent.transfer(ctx, bag.capability!, bag.task!);
      if (!r.ok) {
        push("agent_planning", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "agent_planning");
      }
      bridges.push(r.value.observability);
      bag.agentPlanning = r.value.value;
      push("agent_planning", "succeeded", "Team plan produced", r.value.observability.durationMs);
    }

    // 4. Workflow
    {
      const r = await this.deps.bridges.agentWorkflow.transfer(ctx, bag.agentPlanning!);
      if (!r.ok) {
        push("workflow_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "workflow_intelligence");
      }
      bridges.push(r.value.observability);
      bag.workflow = r.value.value;
      push("workflow_intelligence", "succeeded", "Workflow plan produced", r.value.observability.durationMs);
    }

    // 5. Governance
    {
      const r = await this.deps.bridges.workflowGovernance.transfer(ctx, bag.workflow!);
      if (!r.ok) {
        push("execution_governance", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "execution_governance");
      }
      bridges.push(r.value.observability);
      bag.governance = r.value.value;
      push("execution_governance", "succeeded", "Governance plan produced", r.value.observability.durationMs);
    }

    // 6. Experience Injection
    {
      const r = await this.deps.bridges.experienceInjection.transfer(ctx, bag);
      if (!r.ok) {
        push("experience_injection", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "experience_injection");
      }
      bridges.push(r.value.observability);
      bag.experienceInjection = r.value.value;
      push("experience_injection", "succeeded", "Experience package injected", r.value.observability.durationMs);
    }

    // 7. Execution Intelligence (via capability execution bridge; governance bridge available)
    {
      const r = await this.deps.bridges.capabilityExecution.transfer(ctx, bag);
      if (!r.ok) {
        push("execution_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "execution_intelligence");
      }
      bridges.push(r.value.observability);
      bag.executionIntelligence = r.value.value;
      push("execution_intelligence", "succeeded", "Execution strategy produced", r.value.observability.durationMs);
    }

    // 8. Model Intelligence
    {
      const r = await this.deps.bridges.executionModel.transfer(ctx, bag);
      if (!r.ok) {
        push("model_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "model_intelligence");
      }
      bridges.push(r.value.observability);
      bag.modelIntelligence = r.value.value;
      push("model_intelligence", "succeeded", "Model recommendations produced", r.value.observability.durationMs);
    }

    // 9. Negotiation
    {
      const r = await this.deps.bridges.modelNegotiation.transfer(ctx, bag);
      if (!r.ok) {
        push("negotiation", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "negotiation");
      }
      bridges.push(r.value.observability);
      bag.negotiation = r.value.value;
      push("negotiation", "succeeded", "Negotiation completed", r.value.observability.durationMs);
    }

    // 10. Routing
    {
      const r = await this.deps.bridges.negotiationRouting.transfer(ctx, bag);
      if (!r.ok) {
        push("routing", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "routing");
      }
      bridges.push(r.value.observability);
      bag.routing = r.value.value;
      push("routing", "succeeded", "Routing decision produced", r.value.observability.durationMs);
    }

    if (stopAfterRouting) {
      return this.okReport(request, bag, stages, bridges, completed, start, true);
    }

    // 11. Runtime
    {
      const r = await this.deps.bridges.routingRuntime.transfer(ctx, bag);
      if (!r.ok) {
        push("provider_runtime", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "provider_runtime");
      }
      bridges.push(r.value.observability);
      bag.runtime = r.value.value;
      push("provider_runtime", "succeeded", "Provider execution completed", r.value.observability.durationMs);
    }

    // 12. Consensus
    {
      const r = await this.deps.bridges.runtimeConsensus.transfer(ctx, bag);
      if (!r.ok) {
        push("consensus", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "consensus");
      }
      bridges.push(r.value.observability);
      bag.consensus = r.value.value;
      push("consensus", "succeeded", "Consensus produced", r.value.observability.durationMs);
    }

    // 13. Evaluation
    {
      const r = await this.deps.bridges.consensusEvaluation.transfer(ctx, bag);
      if (!r.ok) {
        push("evaluation", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "evaluation");
      }
      bridges.push(r.value.observability);
      bag.evaluation = r.value.value;
      push("evaluation", "succeeded", "Evaluation completed", r.value.observability.durationMs);
    }

    // 14. Evaluation Intelligence
    {
      const r = await this.deps.bridges.evaluationIntelligence.transfer(ctx, bag.evaluation!);
      if (!r.ok) {
        push("evaluation_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "evaluation_intelligence");
      }
      bridges.push(r.value.observability);
      bag.evaluationIntelligence = r.value.value;
      push(
        "evaluation_intelligence",
        "succeeded",
        "Evaluation intelligence packaged",
        r.value.observability.durationMs
      );
    }

    // 15. Learning
    {
      const r = await this.deps.bridges.evaluationLearning.transfer(ctx, bag);
      if (!r.ok) {
        push("learning", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "learning");
      }
      bridges.push(r.value.observability);
      bag.learning = r.value.value;
      push("learning", "succeeded", "Learning completed", r.value.observability.durationMs);
    }

    // 16. Optimization
    {
      const r = await this.deps.bridges.learningOptimization.transfer(ctx, bag);
      if (!r.ok) {
        push("execution_optimization", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "execution_optimization");
      }
      bridges.push(r.value.observability);
      bag.optimization = r.value.value;
      push("execution_optimization", "succeeded", "Optimization completed", r.value.observability.durationMs);
    }

    // 17. Experience Intelligence
    {
      const r = await this.deps.bridges.optimizationExperience.transfer(ctx, bag);
      if (!r.ok) {
        push("experience_intelligence", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "experience_intelligence");
      }
      bridges.push(r.value.observability);
      bag.experienceIntelligence = r.value.value;
      push("experience_intelligence", "succeeded", "Experiences extracted", r.value.observability.durationMs);
    }

    // 18. Repository Updates
    {
      const r = await this.deps.bridges.experienceRepository.transfer(ctx, bag);
      if (!r.ok) {
        push("repository_updates", "failed", String(r.error.message), 0);
        return this.failReport(request, bag, stages, bridges, completed, start, "repository_updates");
      }
      bridges.push(r.value.observability);
      bag.repositoryUpdates = r.value.value;
      push("repository_updates", "succeeded", "Repository updated", r.value.observability.durationMs);
    }

    return this.okReport(request, bag, stages, bridges, completed, start, true);
  }

  private okReport(
    request: IntelligenceOsIntegrationRequest,
    bag: IntegrationArtifactBag,
    stages: StageTraceRecord[],
    bridges: BridgeObservabilityRecord[],
    completed: IntegrationStageKind[],
    start: number,
    successFlag: boolean
  ): Result<IntelligenceOsIntegrationReport> {
    const correlationId = request.correlationId ?? request.requestId;
    return success({
      resultId: asIntegrationResultId(this.createId("ios")),
      requestId: request.requestId,
      request,
      artifacts: bag,
      trace: {
        traceId: asIntegrationTraceId(this.createId("trace")),
        correlationId,
        requestId: request.requestId,
        stages,
        bridges,
        completedStages: completed,
        capturedAt: this.nowIso(),
      },
      stagesCompleted: completed,
      success: successFlag,
      durationMs: Math.max(0, this.clockMs() - start),
      createdAt: this.nowIso(),
      version: INTELLIGENCE_OS_INTEGRATION_VERSION,
    });
  }

  private failReport(
    request: IntelligenceOsIntegrationRequest,
    bag: IntegrationArtifactBag,
    stages: StageTraceRecord[],
    bridges: BridgeObservabilityRecord[],
    completed: IntegrationStageKind[],
    start: number,
    failedStage: IntegrationStageKind
  ): Result<IntelligenceOsIntegrationReport> {
    const correlationId = request.correlationId ?? request.requestId;
    return success({
      resultId: asIntegrationResultId(this.createId("ios")),
      requestId: request.requestId,
      request,
      artifacts: bag,
      trace: {
        traceId: asIntegrationTraceId(this.createId("trace")),
        correlationId,
        requestId: request.requestId,
        stages,
        bridges,
        completedStages: completed,
        failedStage,
        capturedAt: this.nowIso(),
      },
      stagesCompleted: completed,
      success: false,
      durationMs: Math.max(0, this.clockMs() - start),
      createdAt: this.nowIso(),
      version: INTELLIGENCE_OS_INTEGRATION_VERSION,
    });
  }
}
