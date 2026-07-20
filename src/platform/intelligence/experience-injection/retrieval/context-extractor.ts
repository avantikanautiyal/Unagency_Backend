/**
 * Context extraction — build matching context from execution request.
 * Prefer explicit context; enrich lightly from frozen plan contracts.
 */

import type {
  ExperienceInjectionRequest,
  ExperienceInjectionContext,
} from "../contracts/request";
import type { IContextExtractor } from "../interfaces/experience-injection";

export class DefaultContextExtractor implements IContextExtractor {
  extract(request: ExperienceInjectionRequest): ExperienceInjectionContext {
    const ctx = request.context;
    const task = request.structuredTaskPlan;
    const workflow = request.workflowExecutionPlan;
    const gov = request.governanceExecutionPlan;
    const prompt = request.promptMetadata;

    const primaryCapability =
      ctx.capabilityId ??
      task?.capabilityRequirements?.primary ??
      task?.taskExecutionPlan?.requiredCapabilities?.[0];

    return Object.freeze({
      capabilityId: primaryCapability,
      department: ctx.department,
      industry: ctx.industry,
      taskType: ctx.taskType,
      workflowId: ctx.workflowId ?? (workflow ? String(workflow.planId) : undefined),
      executionStrategy: ctx.executionStrategy,
      reasoningStrategy: ctx.reasoningStrategy,
      promptTemplateId: ctx.promptTemplateId ?? prompt?.templateId,
      modelId: ctx.modelId,
      providerId: ctx.providerId,
      language: ctx.language,
      region: ctx.region,
      budgetTier: ctx.budgetTier,
      complexityTier:
        ctx.complexityTier ?? task?.taskExecutionPlan?.estimatedComplexity,
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      campaignId: ctx.campaignId,
      projectId: ctx.projectId,
      budgetLimit:
        ctx.budgetLimit ?? gov?.budgetAssessment?.totalExecutionBudget,
    });
  }
}
