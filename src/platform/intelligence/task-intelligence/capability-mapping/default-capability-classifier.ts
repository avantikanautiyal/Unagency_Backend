/**
 * Capability classifier.
 */

import { success, type Result } from "../../shared/result";
import { asCapabilityId } from "../../shared/identifiers";
import type { CapabilityMap, CapabilityRequirement } from "../contracts/capability";
import type { DepartmentClassification, TaskClassification } from "../contracts/classification";
import type { ICapabilityClassifier } from "../interfaces/task-intelligence";
import { containsAny, LAUNCH_KEYWORDS, PRODUCT_KEYWORDS } from "../heuristics/keyword-heuristics";

export class DefaultCapabilityClassifier implements ICapabilityClassifier {
  classify(
    prompt: string,
    department: DepartmentClassification,
    task: TaskClassification
  ): Result<CapabilityMap> {
    const isLaunch = containsAny(prompt, LAUNCH_KEYWORDS) && containsAny(prompt, PRODUCT_KEYWORDS);

    const requirements: CapabilityRequirement[] = isLaunch
      ? [
          req("research.market.analysis", "Market Research", 1, 0.9),
          req("research.audience.analysis", "Audience Analysis", 2, 0.85),
          req("branding.review", "Brand Review", 3, 0.8),
          req("campaign.strategy", "Campaign Strategy", 4, 0.9),
          req("content.calendar", "Content Calendar", 5, 0.85),
          req("marketing.social.carousel", "Instagram Carousel", 6, 0.95),
          req("marketing.social.reel", "Instagram Reel", 7, 0.9),
          req("marketing.ads.facebook", "Facebook Ads", 8, 0.85),
          req("marketing.ads.google", "Google Ads", 9, 0.85),
          req("marketing.email.campaign", "Email Campaign", 10, 0.85),
          req("marketing.landing.copy", "Landing Page Copy", 11, 0.85),
          req("seo.metadata", "SEO Metadata", 12, 0.8),
          req("marketing.kpi.plan", "Performance KPI Plan", 13, 0.8),
        ]
      : [
          req("marketing.social.carousel", "Primary capability", 1, 0.7),
          req("marketing.landing.copy", "Supporting copy", 2, 0.6),
        ];

    const primary = requirements[0].capabilityId;

    return success({
      primary,
      requirements,
      confidence: isLaunch ? 0.9 : 0.7,
      rationale: isLaunch
        ? "Product launch requires multi-capability marketing workflow"
        : `Classified under ${department.primary} as ${task.category}`,
    });
  }
}

function req(id: string, label: string, priority: number, confidence: number): CapabilityRequirement {
  return {
    capabilityId: asCapabilityId(id),
    label,
    priority,
    confidence,
    rationale: `${label} required for task execution`,
  };
}
