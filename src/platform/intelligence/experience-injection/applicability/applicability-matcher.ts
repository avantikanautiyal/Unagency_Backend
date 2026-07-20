/**
 * Applicability matching — keep experiences whose conditions match execution context.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { ExperienceInjectionContext } from "../contracts/request";
import type { IApplicabilityMatcher } from "../interfaces/experience-injection";

function matchesField(
  experienceValue: string | undefined,
  contextValue: string | undefined
): boolean {
  if (!experienceValue || !contextValue) return true; // unconstrained = wildcard
  return experienceValue === contextValue;
}

export class DefaultApplicabilityMatcher implements IApplicabilityMatcher {
  match(
    experiences: readonly Experience[],
    context: ExperienceInjectionContext
  ): Result<readonly Experience[]> {
    const matched = experiences.filter((e) => {
      const c = e.applicableConditions;
      return (
        matchesField(
          e.capabilityId ?? (c.capabilityId ? String(c.capabilityId) : undefined),
          context.capabilityId ? String(context.capabilityId) : undefined
        ) &&
        matchesField(e.department ?? c.department, context.department) &&
        matchesField(e.industry ?? c.industry, context.industry) &&
        matchesField(e.taskType ?? c.taskType, context.taskType) &&
        matchesField(e.workflowId ?? c.workflowId, context.workflowId) &&
        matchesField(e.executionStrategy ?? c.executionStrategy, context.executionStrategy) &&
        matchesField(e.promptTemplateId ?? c.promptTemplateId, context.promptTemplateId) &&
        matchesField(e.modelId ?? c.modelId, context.modelId) &&
        matchesField(e.providerId ?? c.providerId, context.providerId) &&
        matchesField(e.language ?? c.language, context.language) &&
        matchesField(
          e.organizationId ?? (c.organizationId ? String(c.organizationId) : undefined),
          context.organizationId ? String(context.organizationId) : undefined
        ) &&
        matchesField(
          e.workspaceId ?? (c.workspaceId ? String(c.workspaceId) : undefined),
          context.workspaceId ? String(context.workspaceId) : undefined
        ) &&
        matchesField(c.complexityTier, context.complexityTier) &&
        matchesField(c.budgetTier, context.budgetTier)
      );
    });

    return success(matched);
  }
}
