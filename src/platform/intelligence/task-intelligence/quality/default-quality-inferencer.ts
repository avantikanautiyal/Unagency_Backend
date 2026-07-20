/**
 * Quality inferencer.
 */

import { success, type Result } from "../../shared/result";
import type { QualityRequirements } from "../contracts/quality";
import type { QualityLevel } from "../contracts/enums";
import type { DepartmentClassification } from "../contracts/classification";
import type { IQualityInferencer } from "../interfaces/task-intelligence";
import { containsAny, LAUNCH_KEYWORDS } from "../heuristics/keyword-heuristics";

export class DefaultQualityInferencer implements IQualityInferencer {
  infer(prompt: string, department: DepartmentClassification): Result<QualityRequirements> {
    const isLaunch = containsAny(prompt, LAUNCH_KEYWORDS);
    const isMarketing = department.primary === "marketing" || department.primary === "social_media";

    return success({
      creativityLevel: isMarketing ? "high" : "standard",
      accuracyLevel: isLaunch ? "high" : "standard",
      brandConsistency: isMarketing || isLaunch ? "premium" : "high",
      complianceRequired: department.primary === "legal" || department.primary === "finance",
      researchDepth: isLaunch ? "high" : "standard",
      formattingStrict: false,
      citationRequired: department.primary === "research",
      reviewRequired: isLaunch,
      rationale: isLaunch
        ? "Product launch requires high brand consistency and review gates"
        : "Standard quality inferred from department",
    });
  }
}
