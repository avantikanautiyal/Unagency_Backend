/**
 * Business goal detector.
 */

import { success, type Result } from "../../shared/result";
import type { BusinessObjective } from "../contracts/business";
import type { IntentProfile } from "../contracts/intent";
import type { DomainKind } from "../contracts/enums";
import type { IBusinessGoalDetector } from "../interfaces/task-intelligence";
import {
  containsAny,
  PRODUCT_KEYWORDS,
  REAL_ESTATE_KEYWORDS,
  SOFTWARE_KEYWORDS,
  LAUNCH_KEYWORDS,
} from "../heuristics/keyword-heuristics";

export class DefaultBusinessGoalDetector implements IBusinessGoalDetector {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  detect(prompt: string, intent: IntentProfile): Result<BusinessObjective> {
    const domain = detectDomain(prompt);
    const isLaunch = containsAny(prompt, LAUNCH_KEYWORDS) && containsAny(prompt, PRODUCT_KEYWORDS);

    return success({
      objectiveId: this.createId("obj"),
      title: isLaunch ? "Product Launch Campaign" : "Business Task Execution",
      description: prompt.trim(),
      domain,
      scenario: isLaunch ? "product_launch" : "general_request",
      successCriteria: isLaunch
        ? [
            "Complete multi-channel launch assets",
            "Aligned brand messaging",
            "Measurable KPI plan",
          ]
        : ["Deliver requested outputs", "Meet quality standards"],
      confidence: intent.confidence,
    });
  }
}

function detectDomain(prompt: string): DomainKind {
  if (containsAny(prompt, REAL_ESTATE_KEYWORDS)) return "real_estate";
  if (containsAny(prompt, SOFTWARE_KEYWORDS)) return "software";
  if (containsAny(prompt, PRODUCT_KEYWORDS)) return "retail";
  return "general";
}
