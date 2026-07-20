/**
 * Department, domain, and task classifiers.
 */

import { success, type Result } from "../../shared/result";
import type { IntentProfile } from "../contracts/intent";
import type { BusinessObjective } from "../contracts/business";
import type {
  DepartmentClassification,
  DomainClassification,
  TaskClassification,
  ClassificationScore,
} from "../contracts/classification";
import type { DepartmentKind, DomainKind } from "../contracts/enums";
import type {
  IDepartmentClassifier,
  IDomainClassifier,
  ITaskClassifier,
} from "../interfaces/task-intelligence";
import {
  containsAny,
  MARKETING_KEYWORDS,
  RESEARCH_KEYWORDS,
  TECH_KEYWORDS,
  CREATIVE_KEYWORDS,
  LAUNCH_KEYWORDS,
  PRODUCT_KEYWORDS,
} from "../heuristics/keyword-heuristics";

export class DefaultDepartmentClassifier implements IDepartmentClassifier {
  classify(prompt: string, _intent: IntentProfile): Result<DepartmentClassification> {
    const scores: ClassificationScore[] = [
      { label: "marketing", score: scoreKeywords(prompt, [...MARKETING_KEYWORDS, ...LAUNCH_KEYWORDS]), confidence: 0.85, },
      { label: "content_creation", score: scoreKeywords(prompt, CREATIVE_KEYWORDS), confidence: 0.75 },
      { label: "social_media", score: containsAny(prompt, ["instagram", "carousel", "reel", "social"]) ? 0.9 : 0.3, confidence: 0.8 },
      { label: "research", score: scoreKeywords(prompt, RESEARCH_KEYWORDS), confidence: 0.7 },
      { label: "software_engineering", score: scoreKeywords(prompt, TECH_KEYWORDS), confidence: 0.7 },
      { label: "branding", score: containsAny(prompt, ["brand", "branding"]) ? 0.8 : 0.2, confidence: 0.7 },
    ].sort((a, b) => b.score - a.score);

    const primary = scores[0].label as DepartmentKind;
    const secondary = scores.slice(1, 3).filter((s) => s.score > 0.3).map((s) => s.label as DepartmentKind);

    return success({
      primary,
      secondary,
      scores,
      confidence: scores[0].confidence,
      rationale: `Marketing and launch language maps to ${primary}`,
    });
  }
}

export class DefaultDomainClassifier implements IDomainClassifier {
  classify(_prompt: string, business: BusinessObjective): Result<DomainClassification> {
    const domain = business.domain;
    return success({
      primary: domain,
      scores: [{ label: domain, score: business.confidence, confidence: business.confidence }],
      confidence: business.confidence,
      rationale: `Business scenario ${business.scenario} indicates ${domain} domain`,
    });
  }
}

export class DefaultTaskClassifier implements ITaskClassifier {
  classify(prompt: string, department: DepartmentClassification): Result<TaskClassification> {
    const isLaunch = containsAny(prompt, LAUNCH_KEYWORDS) && containsAny(prompt, PRODUCT_KEYWORDS);
    return success({
      category: isLaunch ? "product_launch" : department.primary === "software_engineering" ? "development" : "content_creation",
      taskType: isLaunch ? "strategic" : "creative",
      confidence: isLaunch ? 0.9 : 0.7,
      rationale: isLaunch ? "Product launch detected from prompt keywords" : "General task classification",
    });
  }
}

function scoreKeywords(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  const hits = keywords.filter((k) => lower.includes(k)).length;
  return Math.min(1, hits / Math.max(1, keywords.length * 0.25));
}
