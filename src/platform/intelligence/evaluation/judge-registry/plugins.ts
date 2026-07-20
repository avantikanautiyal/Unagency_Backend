/**
 * Thin domain judge plugins — reuse PlaceholderJudge; no duplication of core judges.
 */

import { PlaceholderJudge, buildFinding } from "../judges/base-judge";
import type { EvaluationCriterion, JudgeKind } from "../contracts/evaluation-models";
import type { JudgeContext } from "../interfaces/evaluation-ports";


function heuristicScore(
  context: JudgeContext,
  boostKeywords: readonly string[],
  base = 0.78
): number {
  const text = JSON.stringify(context.request.executionResult.output ?? {}).toLowerCase();
  let score = base;
  for (const k of boostKeywords) {
    if (text.includes(k.toLowerCase())) score += 0.03;
  }
  if (context.request.executionResult.success === false) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}

function makePlugin(kind: JudgeKind, judgeId: string, keywords: readonly string[]) {
  return class extends PlaceholderJudge {
    readonly kind = kind;
    readonly judgeId = judgeId;
    protected evaluateCriterion(criterion: EvaluationCriterion, context: JudgeContext) {
      const rawScore = heuristicScore(context, keywords);
      const findings =
        rawScore < criterion.threshold
          ? [buildFinding(criterion.id, "warning", `${kind} below threshold`)]
          : undefined;
      return { rawScore, notes: `${kind} plugin heuristic`, findings };
    }
  };
}

export const MarketingJudgePlugin = makePlugin("marketing", "judge_marketing_v1", [
  "campaign",
  "cta",
  "audience",
]);
export const CreativeJudgePlugin = makePlugin("creative", "judge_creative_v1", [
  "creative",
  "story",
  "visual",
]);
export const SocialMediaJudgePlugin = makePlugin("social_media", "judge_social_v1", [
  "instagram",
  "carousel",
  "social",
]);
export const SeoJudgePlugin = makePlugin("seo", "judge_seo_v1", ["seo", "keyword"]);
export const AccessibilityJudgePlugin = makePlugin("accessibility", "judge_a11y_v1", [
  "alt",
  "accessible",
]);
export const ArchitectureJudgePlugin = makePlugin("architecture", "judge_architecture_v1", [
  "architecture",
  "module",
  "layer",
]);
export const SecurityJudgePlugin = makePlugin("security", "judge_security_v1", [
  "security",
  "auth",
  "encrypt",
]);
export const PerformanceJudgePlugin = makePlugin("performance", "judge_performance_v1", [
  "performance",
  "latency",
  "cache",
]);
export const CodeQualityJudgePlugin = makePlugin("code_quality", "judge_code_quality_v1", [
  "clean",
  "readable",
]);
export const TestingJudgePlugin = makePlugin("testing", "judge_testing_v1", [
  "test",
  "coverage",
]);
export const MaintainabilityJudgePlugin = makePlugin(
  "maintainability",
  "judge_maintainability_v1",
  ["maintain", "refactor"]
);
export const MedicalJudgePlugin = makePlugin("medical", "judge_medical_v1", [
  "diagnosis",
  "clinical",
  "patient",
]);
export const LegalJudgePlugin = makePlugin("legal", "judge_legal_v1", ["clause", "liability"]);
export const FinanceJudgePlugin = makePlugin("finance", "judge_finance_v1", [
  "forecast",
  "revenue",
]);
export const ResearchJudgePlugin = makePlugin("research", "judge_research_v1", [
  "citation",
  "source",
]);
export const ReasoningJudgePlugin = makePlugin("reasoning", "judge_reasoning_v1", [
  "because",
  "therefore",
]);
export const ComplianceJudgePlugin = makePlugin("compliance", "judge_compliance_v1", [
  "compliant",
  "regulation",
]);
export const UxJudgePlugin = makePlugin("ux", "judge_ux_v1", ["ux", "usability"]);
export const ImageQualityJudgePlugin = makePlugin("image_quality", "judge_image_v1", [
  "image",
  "resolution",
]);
export const VideoQualityJudgePlugin = makePlugin("video_quality", "judge_video_v1", [
  "video",
  "frame",
]);
export const AudioQualityJudgePlugin = makePlugin("audio_quality", "judge_audio_v1", [
  "audio",
  "voice",
]);
