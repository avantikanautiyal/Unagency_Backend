/**
 * Applicability engine — defines WHERE experiences apply.
 */

import { success, type Result } from "../../shared/result";
import type { ApplicabilityConditions } from "../contracts/applicability";
import type { Experience } from "../contracts/experience";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { IApplicabilityEngine } from "../interfaces/experience-intelligence";

export class DefaultApplicabilityEngine implements IApplicabilityEngine {
  derive(
    inputs: ExperienceIntelligenceInputs,
    experiences: readonly Experience[]
  ): Result<readonly ApplicabilityConditions[]> {
    const maps: ApplicabilityConditions[] = experiences.map((e) => e.applicableConditions);

    for (const meta of inputs.executionMetadata ?? []) {
      maps.push(
        Object.freeze({
          capabilityId: meta.capabilityId,
          executionStrategy: meta.strategy,
          providerId: String(meta.primaryProviderId),
        })
      );
    }

    for (const prompt of inputs.promptMetadata ?? []) {
      maps.push(
        Object.freeze({
          promptTemplateId: prompt.templateId,
        })
      );
    }

    for (const route of inputs.routingDecisions ?? []) {
      maps.push(
        Object.freeze({
          providerId: String(route.plan.primary.providerId),
          modelId: route.plan.primary.modelId,
        })
      );
    }

    return success(maps);
  }
}
