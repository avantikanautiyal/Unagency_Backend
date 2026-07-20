/**
 * Pipeline validator.
 */

import { success, type Result } from "../../shared/result";
import type { ArtifactChain } from "../contracts/artifacts";
import type { PipelineDiagnostics, StageDiagnostic } from "../contracts/diagnostics";
import type { PipelineStageKind } from "../contracts/enums";
import type { IPipelineValidator } from "../interfaces/control-plane";
import { PIPELINE_STAGE_ORDER } from "../constants";

const REQUIRED_ARTIFACTS: Record<PipelineStageKind, keyof ArtifactChain> = {
  task_intelligence: "task",
  agent_planning: "team",
  workflow_intelligence: "workflow",
  execution_governance: "governance",
  execution_intelligence: "executionIntelligence",
  model_intelligence: "modelDecision",
  negotiation: "negotiation",
  routing: "routing",
};

export class DefaultPipelineValidator implements IPipelineValidator {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  validate(chain: ArtifactChain): Result<PipelineDiagnostics> {
    const stageResults: StageDiagnostic[] = [];
    const warnings: string[] = [];

    for (const stage of PIPELINE_STAGE_ORDER) {
      const key = REQUIRED_ARTIFACTS[stage];
      const present = chain[key] !== undefined;
      stageResults.push({
        stage,
        success: present,
        message: present ? `${stage} artifact present` : `Missing ${stage} artifact`,
        warnings: [],
      });
      if (!present) warnings.push(`Missing artifact for ${stage}`);
    }

    if (chain.task && chain.team) {
      const taskPlanId = chain.task.report.structuredTaskPlan.planId;
      const agentInput = chain.team.report.request.structuredTaskPlan.planId;
      if (taskPlanId !== agentInput) {
        warnings.push("Task plan ID mismatch in agent planning input");
      }
    }

    return success({
      diagnosticsId: this.createId("val"),
      stageTimings: [],
      stageResults,
      validationPassed: warnings.length === 0,
      recommendations: warnings,
      explainabilityRefs: [],
    });
  }
}
