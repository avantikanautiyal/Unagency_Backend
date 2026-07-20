/**
 * Intent analyzer — heuristic keyword classification.
 */

import { success, type Result } from "../../shared/result";
import type { IntentProfile, IntentScore } from "../contracts/intent";
import type { IntentKind } from "../contracts/enums";
import type { IIntentAnalyzer } from "../interfaces/task-intelligence";
import {
  containsAny,
  scoreKeywords,
  LAUNCH_KEYWORDS,
  CREATIVE_KEYWORDS,
  TECH_KEYWORDS,
  RESEARCH_KEYWORDS,
  MARKETING_KEYWORDS,
} from "../heuristics/keyword-heuristics";

export class DefaultIntentAnalyzer implements IIntentAnalyzer {
  analyze(prompt: string): Result<IntentProfile> {
    const scores: IntentScore[] = [
      score("business", scoreKeywords(prompt, LAUNCH_KEYWORDS) * 0.9 + scoreKeywords(prompt, MARKETING_KEYWORDS) * 0.3, "Launch and campaign language detected"),
      score("creative", scoreKeywords(prompt, CREATIVE_KEYWORDS) + scoreKeywords(prompt, MARKETING_KEYWORDS) * 0.5, "Creative and content signals"),
      score("strategic", scoreKeywords(prompt, LAUNCH_KEYWORDS) * 0.7 + scoreKeywords(prompt, RESEARCH_KEYWORDS) * 0.4, "Strategic planning signals"),
      score("analytical", scoreKeywords(prompt, RESEARCH_KEYWORDS), "Research and analysis signals"),
      score("technical", scoreKeywords(prompt, TECH_KEYWORDS), "Technical development signals"),
      score("operational", containsAny(prompt, ["support", "reply", "ticket"]) ? 0.7 : 0.2, "Operational task signals"),
    ].sort((a, b) => b.score - a.score);

    const primary = scores[0].intent;
    const secondary = scores[1]?.score > 0.3 ? scores[1].intent : undefined;

    return success({
      primaryIntent: primary,
      secondaryIntent: secondary,
      scores,
      summary: `Primary intent: ${primary}${secondary ? ` with secondary ${secondary}` : ""}`,
      confidence: scores[0].confidence,
    });
  }
}

function score(intent: IntentKind, raw: number, rationale: string): IntentScore {
  const s = Math.min(0.99, Math.max(0.1, raw));
  return { intent, score: s, confidence: s, rationale };
}
