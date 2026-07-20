/**
 * Intelligence Control Plane Engine.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import { asControlPlaneResultId } from "../contracts/identifiers";
import type { ControlPlaneRequest } from "../contracts/request";
import type { ControlPlaneReport } from "../contracts/result";
import type { UnifiedExplanation } from "../contracts/explainability";
import type { PipelineSimulationReport } from "../contracts/simulation";
import type {
  IIntelligenceControlPlaneEngine,
  IPipelineOrchestrator,
  IPipelineValidator,
  IPipelineSimulator,
} from "../interfaces/control-plane";

export interface ControlPlaneEngineDeps {
  readonly orchestrator: IPipelineOrchestrator;
  readonly validator: IPipelineValidator;
  readonly simulator: IPipelineSimulator;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
}

export class IntelligenceControlPlaneEngine implements IIntelligenceControlPlaneEngine {
  private readonly nowIso: () => string;
  private readonly createId: (prefix: string) => string;

  constructor(private readonly deps: ControlPlaneEngineDeps) {
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
    this.createId = deps.createId ?? ((p) => `${p}_${Date.now()}`);
  }

  async plan(request: ControlPlaneRequest): Promise<Result<ControlPlaneReport>> {
    const invalid = this.validate(request);
    if (invalid) return failure(invalid);

    const pipeline = await this.deps.orchestrator.execute(request);
    if (!pipeline.ok) return pipeline;

    const validation = this.deps.validator.validate(pipeline.value.artifacts);
    const diagnostics = validation.ok
      ? { ...pipeline.value.diagnostics, validationPassed: validation.value.validationPassed }
      : pipeline.value.diagnostics;

    const simulation =
      request.mode === "simulate"
        ? this.deps.simulator.simulate(request, pipeline.value.statistics)
        : undefined;

    return success({
      resultId: asControlPlaneResultId(this.createId("cp")),
      request,
      executionReadyPlan: pipeline.value.executionReadyPlan,
      context: {
        contextId: this.createId("ctx"),
        requestId: request.requestId,
        stageTimings: diagnostics.stageTimings,
        warnings: diagnostics.recommendations,
        errors: [],
        skippedStages: [],
      },
      planningState: {
        currentStage: "complete",
        stagesCompleted: diagnostics.stageTimings.map((t) => t.stage),
        totalDurationMs: pipeline.value.statistics.totalDurationMs,
      },
      diagnostics,
      simulation: simulation?.ok ? simulation.value : undefined,
      explanation: pipeline.value.explanation,
      artifacts: pipeline.value.artifacts,
      statistics: pipeline.value.statistics,
      createdAt: this.nowIso(),
    });
  }

  async simulate(request: ControlPlaneRequest): Promise<Result<PipelineSimulationReport>> {
    const result = await this.plan({ ...request, mode: "simulate" });
    if (!result.ok) return result;
    if (!result.value.simulation) {
      return failure(new ValidationError("simulation not produced"));
    }
    return success(result.value.simulation);
  }

  async explain(request: ControlPlaneRequest): Promise<Result<UnifiedExplanation>> {
    const result = await this.plan(request);
    if (!result.ok) return result;
    return success(result.value.explanation);
  }

  private validate(request: ControlPlaneRequest): ValidationError | null {
    if (!request.requestId?.trim()) return new ValidationError("requestId required");
    if (!request.rawPrompt?.trim()) return new ValidationError("rawPrompt required");
    return null;
  }
}
