/**
 * Default experience builder.
 */

import { asExperienceId } from "../contracts/identifiers";
import type { Experience } from "../contracts/experience";
import type { ExperienceCategory } from "../contracts/enums";
import type { EvaluationReport } from "../../evaluation/contracts/evaluation-models";
import type { LearningResult } from "../../learning/contracts/learning-models";
import type { ProviderObservabilityReport } from "../../execution-optimization/contracts/inputs";
import type { ModelDecisionRecord } from "../../model-intelligence/contracts/decision-record";
import type { HumanArtifact } from "../../artifacts/contracts/typed-artifacts";
import { EXPERIENCE_INTELLIGENCE_VERSION } from "../constants";

export class DefaultExperienceBuilder {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  buildFromEvaluation(
    report: EvaluationReport,
    category: ExperienceCategory,
    createId: (prefix: string) => string
  ): Experience {
    const failed = report.summary.failedCriteria;
    const rootCauseKind = failed.includes("brand_alignment")
      ? "brand_mismatch"
      : failed.includes("cta")
        ? "weak_cta"
        : failed.includes("hallucination")
          ? "hallucination"
          : "unknown";

    return this.baseExperience(createId, category, {
      trigger: `evaluation_score_${report.summary.overallScore}`,
      rootCauseKind,
      rootCauseDesc: failed.length ? `Failed: ${failed.join(", ")}` : "Evaluation passed",
      observed: report.summary.passed ? "Successful execution" : "Failed evaluation criteria",
      correctionKind: rootCauseKind === "weak_cta" ? "include_cta" : "clarify_prompt",
      correctionInstruction:
        rootCauseKind === "weak_cta"
          ? "Always include CTA in marketing outputs"
          : "Clarify prompt constraints",
      recommendation: category === "positive" ? "Repeat this strategy" : "Apply correction strategy",
      evidence: [`eval:${report.reportId}`, `score:${report.summary.overallScore}`],
      artifactIds: [report.reportId],
      capabilityId: undefined,
      confidence: report.summary.overallScore,
    });
  }

  buildFromOptimization(
    rec: { readonly id: string; readonly title: string; readonly description: string; readonly priority: string },
    createId: (prefix: string) => string
  ): Experience {
    return this.baseExperience(createId, "optimization", {
      trigger: rec.title,
      rootCauseKind: "unknown",
      rootCauseDesc: rec.description,
      observed: "Optimization recommendation identified",
      correctionKind: "custom",
      correctionInstruction: rec.description,
      recommendation: rec.title,
      evidence: [`opt:${rec.id}`],
      artifactIds: [rec.id],
      confidence: rec.priority === "high" ? 0.85 : 0.65,
    });
  }

  buildFromLearning(
    insight: { readonly insightId: string; readonly title: string; readonly description: string; readonly severity: string },
    learning: LearningResult,
    createId: (prefix: string) => string
  ): Experience {
    const confidence = insight.severity === "critical" ? 0.9 : insight.severity === "warning" ? 0.7 : 0.5;
    return this.baseExperience(createId, "best_practice", {
      trigger: insight.title,
      rootCauseKind: "unknown",
      rootCauseDesc: insight.description,
      observed: "Learning pattern detected",
      correctionKind: "custom",
      correctionInstruction: insight.description,
      recommendation: insight.title,
      evidence: [`learn:${insight.insightId}`, `signals:${learning.signals.length}`],
      artifactIds: [learning.requestId],
      confidence,
    });
  }

  buildFromObservability(obs: ProviderObservabilityReport, createId: (prefix: string) => string): Experience {
    const rootCauseKind = obs.errorRate > 0.15 ? "poor_model_choice" : "latency_exceeded";
    return this.baseExperience(createId, "negative", {
      trigger: `provider_${obs.providerId}_degraded`,
      rootCauseKind,
      rootCauseDesc: `Success rate ${obs.successRate}, quality ${obs.qualityScore}`,
      observed: "Provider performance degraded",
      correctionKind: rootCauseKind === "poor_model_choice" ? "switch_model" : "switch_provider",
      correctionInstruction: "Consider alternative provider or model",
      recommendation: "Review provider selection for this capability",
      evidence: [`obs:${obs.reportId}`, `provider:${obs.providerId}`],
      artifactIds: [obs.reportId],
      providerId: obs.providerId,
      capabilityId: obs.capabilityId ? String(obs.capabilityId) : undefined,
      confidence: 1 - obs.successRate,
    });
  }

  buildFromObservabilitySuccess(obs: ProviderObservabilityReport, createId: (prefix: string) => string): Experience {
    return this.baseExperience(createId, "positive", {
      trigger: `provider_${obs.providerId}_success`,
      rootCauseKind: "unknown",
      rootCauseDesc: "High success rate observed",
      observed: `Provider ${obs.providerId} performing well`,
      correctionKind: "custom",
      correctionInstruction: "Prefer this provider for similar tasks",
      recommendation: "Reuse provider selection strategy",
      evidence: [`obs:${obs.reportId}`],
      artifactIds: [obs.reportId],
      providerId: obs.providerId,
      capabilityId: obs.capabilityId ? String(obs.capabilityId) : undefined,
      confidence: obs.successRate,
    });
  }

  buildFromModelDecision(record: ModelDecisionRecord, createId: (prefix: string) => string): Experience {
    return this.baseExperience(createId, "model", {
      trigger: `model_selected_${record.winningModel.modelId}`,
      rootCauseKind: "unknown",
      rootCauseDesc: record.reasonForSelection,
      observed: `Model ${record.winningModel.modelId} selected`,
      correctionKind: "custom",
      correctionInstruction: record.reasonForSelection,
      recommendation: `Use ${record.winningModel.modelId} for similar capabilities`,
      evidence: [`model:${record.recordId}`],
      artifactIds: [String(record.recordId)],
      modelId: String(record.winningModel.modelId),
      capabilityId: String(record.capabilityId),
      department: record.department,
      confidence: record.expectedConfidence,
    });
  }

  buildFromHumanFeedback(human: HumanArtifact, createId: (prefix: string) => string): Experience {
    const feedback = human.payload.feedback;
    return this.baseExperience(createId, "correction", {
      trigger: "human_review_feedback",
      rootCauseKind: "prompt_ambiguity",
      rootCauseDesc: "Human reviewer provided corrective feedback",
      observed: JSON.stringify(feedback).slice(0, 200),
      correctionKind: "clarify_prompt",
      correctionInstruction: "Apply human reviewer guidance",
      recommendation: "Incorporate human feedback in future similar executions",
      evidence: [`human:${human.identity.artifactId}`],
      artifactIds: [human.identity.artifactId],
      confidence: 0.9,
    });
  }

  private baseExperience(
    createId: (prefix: string) => string,
    category: ExperienceCategory,
    opts: {
      trigger: string;
      rootCauseKind: import("../contracts/enums").RootCauseKind;
      rootCauseDesc: string;
      observed: string;
      correctionKind: import("../contracts/enums").CorrectionKind;
      correctionInstruction: string;
      recommendation: string;
      evidence: readonly string[];
      artifactIds: readonly string[];
      confidence: number;
      capabilityId?: string;
      department?: string;
      providerId?: string;
      modelId?: string;
    }
  ): Experience {
    const id = asExperienceId(createId("exp"));
    const now = this.nowIso();
    return Object.freeze({
      experienceId: id,
      category,
      type: category,
      trigger: opts.trigger,
      context: {},
      rootCause: Object.freeze({
        causeId: createId("rc"),
        kind: opts.rootCauseKind,
        description: opts.rootCauseDesc,
        evidence: opts.evidence,
        confidence: opts.confidence,
      }),
      observedBehaviour: opts.observed,
      correctionStrategy: Object.freeze({
        strategyId: createId("corr"),
        kind: opts.correctionKind,
        instruction: opts.correctionInstruction,
        rationale: opts.rootCauseDesc,
        priority: opts.confidence > 0.8 ? "high" : "medium",
        advisoryOnly: true as const,
      }),
      recommendation: opts.recommendation,
      confidence: opts.confidence,
      evidence: opts.evidence,
      supportingArtifactIds: opts.artifactIds,
      applicableConditions: Object.freeze({
        capabilityId: opts.capabilityId as never,
        department: opts.department,
        providerId: opts.providerId,
        modelId: opts.modelId,
      }),
      capabilityId: opts.capabilityId,
      department: opts.department,
      providerId: opts.providerId,
      modelId: opts.modelId,
      usageCount: 0,
      successCount: category === "positive" || category === "best_practice" ? 1 : 0,
      failureCount: category === "negative" || category === "anti_pattern" ? 1 : 0,
      averageImprovement: category === "positive" ? 0.15 : 0,
      scores: Object.freeze({
        confidence: opts.confidence,
        evidenceScore: Math.min(1, opts.evidence.length * 0.25),
        impactScore: category === "negative" ? 0.8 : 0.5,
        reuseScore: 0,
        improvementScore: category === "positive" ? 0.15 : 0,
        applicabilityScore: opts.capabilityId ? 0.8 : 0.4,
      }),
      explanation: Object.freeze({
        whyExists: opts.rootCauseDesc,
        evidenceSummary: opts.evidence.join("; "),
        whenApplies: opts.capabilityId ? `Capability ${opts.capabilityId}` : "General platform scope",
        whenNotApplies: "Different capability or context",
        historicalImprovement: `${opts.confidence * 100}% confidence from historical data`,
      }),
      lifecycle: "draft",
      version: EXPERIENCE_INTELLIGENCE_VERSION,
      createdAt: now,
    });
  }
}
